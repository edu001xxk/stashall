let body = $response.body;

// 防止因响应体为空导致的报错
if (!body) {
    $done({});
}

// 1. 提取番号
// 使用正则在返回的 JSON 或文本数据中匹配类似 SSIS-123 的标准番号格式
// 匹配: 2-6个字母 + 连字符 + 3-5个数字
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body.match(idReg);

if (match && match[1]) {
    let code = match[1].toLowerCase();
    console.log(`[JavDB-SenPlayer] 成功抓取到番号: ${code}`);

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
                console.log(`[JavDB-SenPlayer] 成功抓取到源链接: ${m3u8}`);
                
                // 4. 发送附带跳转链接的系统通知
                postNotification(
                    "▶ 解析成功: " + code.toUpperCase(), 
                    "Jable 视频源已找到", 
                    "👇 点击此通知立即跳转 SenPlayer 播放", 
                    senplayerUrl
                );
            } else {
                console.log(`[JavDB-SenPlayer] 影片 ${code} 未在 Jable 页面找到 m3u8 链接`);
            }
        } else {
            console.log(`[JavDB-SenPlayer] 请求 Jable 失败或被拦截，状态码: ${response ? response.status : '未知'}`);
        }
        
        // 释放请求，让 App 继续加载
        $done({ body });
    });
} else {
    // 没找到番号，直接放行
    $done({ body });
}

// 兼容 Stash 和小火箭 (Shadowrocket) 的通知点击跳转格式
function postNotification(title, subtitle, content, url) {
    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        // Stash 格式
        $notification.post(title, subtitle, content, { url: url });
    } else {
        // 小火箭 / Surge 格式
        $notification.post(title, subtitle, content, url);
    }
}