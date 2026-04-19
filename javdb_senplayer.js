/*
 * JavDB App 自动解析并拉起 SenPlayer
 * 逻辑：拦截 API -> 提取番号 -> 搜索 Jable/MissAV -> 推送带 Scheme 的通知
 */

let body = $response.body;

if (!body) {
    $done({});
}

// 1. 匹配标准番号 (如 ABC-123)
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body.match(idReg);

if (match && match[1]) {
    let code = match[1].toLowerCase();
    console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);

    let jableUrl = `https://jable.tv/videos/${code}/`;

    // 2. 优先请求 Jable
    $httpClient.get({
        url: jableUrl,
        headers: getFakeHeaders()
    }, function(error, response, data) {
        let foundM3u8 = false;

        if (!error && response.status === 200) {
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = data.match(m3u8Reg);
            if (m3u8Match) {
                foundM3u8 = true;
                handleSuccess(code, m3u8Match[0], "Jable");
            }
        }
        
        // 3. 备用方案：Jable没找到，转而搜索 MissAV
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 未找到或被拦截，转去 MissAV...`);
            fetchMissAV(`https://missav.ai/cn/${code}`, code, 0);
        }
    });
} else {
    $done({ body });
}

// ==========================================
// 核心：处理 MissAV 请求与 CF 盾诊断
// ==========================================
function fetchMissAV(url, code, redirectCount) {
    if (redirectCount > 3) {
        console.log(`[JavDB-SenPlayer] ❌ MissAV 重定向次数过多，已停止请求`);
        $done({ body });
        return;
    }
    
    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (err) {
            console.log(`[JavDB-SenPlayer] ❌ MissAV 网络请求直接报错: ${err}`);
            $done({ body });
            return;
        }
        
        // 【CF 盾检测】
        if (resp.status === 403 || resp.status === 503) {
            console.log(`[JavDB-SenPlayer] 🛡️ 遭遇 CF 盾拦截！状态码: ${resp.status}`);
            $done({ body });
            return;
        }
        
        // 处理重定向
        if (resp.status === 301 || resp.status === 302 || resp.status === 308) {
            let location = resp.headers['Location'] || resp.headers['location'];
            if (location) {
                if (location.startsWith('/')) {
                    let domain = url.match(/^https?:\/\/[^\/]+/)[0];
                    location = domain + location;
                }
                fetchMissAV(location, code, redirectCount + 1);
            } else {
                $done({ body });
            }
            return;
        }
        
        if (resp.status === 200) {
            let unescapedData = data.replace(/\\/g, "");
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = unescapedData.match(m3u8Reg);

            if (m3u8Match) {
                handleSuccess(code, m3u8Match[0], "MissAV");
            } else {
                if (redirectCount === 0) {
                    fetchMissAV(`https://missav.ai/cn/search/${code}`, code, 1);
                } else {
                    $done({ body });
                }
            }
        } else {
            $done({ body });
        }
    });
}

function getFakeHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9"
    };
}

// ==========================================
// 提取成功后的处理函数 (修改：直接拉起 SenPlayer)
// ==========================================
function handleSuccess(code, m3u8, source) {
    console.log(`\n🎯 [成功获取 M3U8] 数据源: ${source}`);
    
    // 生成 SenPlayer 的 URL Scheme 播放链接
    let senPlayerUrl = `SenPlayer://x-callback-url/play?url=${encodeURIComponent(m3u8)}`;
    
    let title = `▶ 解析成功 (${source}): ${code.toUpperCase()}`;
    let subtitle = `找到流媒体链接，点击立即播放`;
    let content = `视频源: ${source}\n点击此通知自动拉起 SenPlayer`;

    // Stash 发送通知并挂载跳转 URL
    $notification.post(title, subtitle, content, { url: senPlayerUrl });

    $done({ body });
}