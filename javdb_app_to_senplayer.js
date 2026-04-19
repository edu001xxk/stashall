let body = $response.body;
let url = $request.url;

// 1. 提取番号
// 兼容网页版 HTML 结构。如果 App 走的是 JSON 接口，这里可能需要调整正则
let idReg = /<strong class="title is-4">([a-zA-Z0-9-]+)<\/strong>/i;
let match = body.match(idReg);

if (match && match[1]) {
    let code = match[1].toLowerCase();
    let jableUrl = `https://jable.tv/videos/${code}/`;

    // 2. 异步请求 Jable
    $httpClient.get({
        url: jableUrl,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        }
    }, function(error, response, data) {
        if (!error && response.status === 200) {
            // 3. 正则提取 m3u8 链接
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/;
            let m3u8Match = data.match(m3u8Reg);

            if (m3u8Match) {
                let m3u8 = m3u8Match[0];
                let senplayerUrl = `senplayer://${m3u8}`;
                
                // 4. 发送附带跳转链接的系统通知
                postNotification(
                    "▶ 解析成功: " + code.toUpperCase(), 
                    "Jable 视频源已找到", 
                    "👇 点击此通知立即跳转 SenPlayer 播放", 
                    senplayerUrl
                );
            } else {
                console.log(`[JavDB-SenPlayer] ${code} 未在 Jable 页面找到 m3u8`);
            }
        } else {
            console.log(`[JavDB-SenPlayer] 请求 Jable 失败或被拦截`);
        }
        
        // 释放请求，让 App 继续加载原来的内容
        $done({ body });
    });
} else {
    // 没找到番号，直接放行
    $done({ body });
}

// 兼容 Stash 和小火箭的通知点击跳转格式
function postNotification(title, subtitle, content, url) {
    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        // Stash 格式
        $notification.post(title, subtitle, content, { url: url });
    } else {
        // 小火箭 (Shadowrocket) / Surge 格式
        $notification.post(title, subtitle, content, url);
    }
}