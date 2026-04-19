let body = $response.body;

if (!body) {
    $done({});
}

// 1. 匹配标准番号
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body.match(idReg);

if (match && match[1]) {
    let code = match[1].toLowerCase();

    let jableUrl = `https://jable.tv/videos/${code}/`;

    // 2. 异步请求 Jable 页面
    $httpClient.get({
        url: jableUrl,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        }
    }, function(error, response, data) {
        if (!error && response.status === 200) {
            
            // 3. 正则提取 m3u8
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/;
            let m3u8Match = data.match(m3u8Reg);

            if (m3u8Match) {
                let m3u8 = m3u8Match[0];
                
                // 4. 【终极绝杀】利用苹果官方 Shortcuts 协议，把 m3u8 传给快捷指令
                let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(m3u8)}`;
                
                // 5. 兼容性最好的通知格式
                if (typeof $environment !== 'undefined' && $environment['stash-version']) {
                    $notification.post(`▶ 解析成功: ${code.toUpperCase()}`, "Jable 视频源已找到", "👇 点击此通知立即拉起 SenPlayer 播放", { url: shortcutUrl });
                } else {
                    $notification.post(`▶ 解析成功: ${code.toUpperCase()}`, "Jable 视频源已找到", "👇 点击此通知立即拉起 SenPlayer 播放", shortcutUrl);
                }
            }
        }
        $done({ body });
    });
} else {
    $done({ body });
}