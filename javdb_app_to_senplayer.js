let url = $request.url;
let body = $response.body;

// 1. 安全防护：如果没有正文，或者请求的是图片/视频，直接静默放行，防止脚本崩溃！
let isMedia = /\.(jpg|jpeg|png|gif|webp|mp4|m3u8|ts)(\?.*)?$/i.test(url);
if (!body || isMedia) {
    $done({});
}

// 2. 尝试在返回的文本/JSON数据中提取番号
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body.match(idReg);

if (match && match[1]) {
    let code = match[1].toLowerCase();
    console.log(`[JavDB-SenPlayer] 成功在接口 ${url} 中抓取到番号: ${code}`);

    let jableUrl = `https://jable.tv/videos/${code}/`;

    // 3. 异步请求 Jable
    $httpClient.get({
        url: jableUrl,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        }
    }, function(error, response, data) {
        if (!error && response.status === 200) {
            
            // 4. 正则提取 m3u8 链接
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/;
            let m3u8Match = data.match(m3u8Reg);

            if (m3u8Match) {
                let m3u8 = m3u8Match[0];
                let senplayerUrl = `senplayer://${m3u8}`;
                
                // 5. 唤醒 SenPlayer 的通知弹窗
                if (typeof $environment !== 'undefined' && $environment['stash-version']) {
                    $notification.post("▶ 解析成功: " + code.toUpperCase(), "Jable 源已找到", "👇 点击此通知立即跳转 SenPlayer 播放", { url: senplayerUrl });
                } else {
                    $notification.post("▶ 解析成功: " + code.toUpperCase(), "Jable 源已找到", "👇 点击此通知立即跳转 SenPlayer 播放", senplayerUrl);
                }
            } else {
                console.log(`[JavDB-SenPlayer] 影片 ${code} 未在 Jable 找到源`);
            }
        }
        $done({ body });
    });
} else {
    // 没匹配到番号，原样放行
    $done({ body });
}