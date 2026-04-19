/*
 * JavDB App 自动解析并拉起 SenPlayer (修正版)
 */

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
        
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 未找到，尝试 MissAV...`);
            fetchMissAV(`https://missav.ai/cn/${code}`, code, 0);
        }
    });
} else {
    $done({ body });
}

function fetchMissAV(url, code, redirectCount) {
    if (redirectCount > 3) {
        $done({ body });
        return;
    }
    
    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (err || resp.status === 403 || resp.status === 503) {
            $done({ body });
            return;
        }
        
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
            } else if (redirectCount === 0) {
                fetchMissAV(`https://missav.ai/cn/search/${code}`, code, 1);
            } else {
                $done({ body });
            }
        } else {
            $done({ body });
        }
    });
}

function getFakeHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };
}

// ==========================================
// 提取成功处理：修正跳转逻辑
// ==========================================
function handleSuccess(code, m3u8, source) {
    // 修正：使用全小写 scheme，这是 iOS App 的标准写法
    let senPlayerUrl = `senplayer://x-callback-url/play?url=${encodeURIComponent(m3u8)}`;
    
    console.log(`[JavDB-SenPlayer] 🎯 最终生成的跳转链接: ${senPlayerUrl}`);
    
    let title = `▶ 解析成功 (${source}): ${code.toUpperCase()}`;
    let subtitle = `找到播放源，点击立即跳转播放`;
    let content = `点击此通知唤起 SenPlayer`;

    // 修正：Stash 环境下确保通知参数正确
    // 同时传入 url 和 open-url 以确保 100% 跳转成功
    $notification.post(title, subtitle, content, { 
        "url": senPlayerUrl,
        "open-url": senPlayerUrl 
    });

    $done({ body });
}