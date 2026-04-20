let body = $response.body;

if (!body) {
    $done({});
}

// 1. 匹配标准番号
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
            console.log(`[JavDB-SenPlayer] 🛡️ 遭遇 CF 盾拦截！状态码: ${resp.status}，脚本无法绕过此级别防御。`);
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
                console.log(`[JavDB-SenPlayer] 🔄 自动跟随重定向至: ${location}`);
                fetchMissAV(location, code, redirectCount + 1);
            } else {
                $done({ body });
            }
            return;
        }
        
        // 如果成功获取网页
        if (resp.status === 200) {
            let unescapedData = data.replace(/\\/g, "");
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = unescapedData.match(m3u8Reg);

            if (m3u8Match) {
                handleSuccess(code, m3u8Match[0], "MissAV");
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ MissAV (状态码200) 未找到m3u8。可能是JS加密或该番号不存在。`);
                // 打印前100个字符用于诊断
                console.log(`[网页片段诊断]: ${data.substring(0, 150).replace(/\n/g, '')}`);
                
                if (redirectCount === 0) {
                    console.log(`[JavDB-SenPlayer] 尝试使用搜索接口...`);
                    fetchMissAV(`https://missav.ai/cn/search/${code}`, code, 1);
                } else {
                    $done({ body });
                }
            }
        } else {
            console.log(`[JavDB-SenPlayer] ❌ 未知错误，状态码: ${resp.status}`);
            $done({ body });
        }
    });
}

// ==========================================
// 伪装请求头（尝试欺骗防爬虫策略）
// ==========================================
function getFakeHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Connection": "keep-alive"
    };
}

// ==========================================
// 提取成功后的处理函数
// ==========================================
function handleSuccess(code, m3u8, source) {
    console.log(`\n==================================`);
    console.log(`🎯 [成功获取 M3U8] 数据源: ${source}`);
    console.log(`🔗 播放链接: ${m3u8}`);
    console.log(`==================================\n`);
    
    let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(m3u8)}`;
    let title = `▶ 解析成功 (${source}): ${code.toUpperCase()}`;
    let subtitle = `已找到串流链接并记录至日志`;
    let content = `👇 点击弹窗立即拉起 SenPlayer`;

    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    $done({ body });
}