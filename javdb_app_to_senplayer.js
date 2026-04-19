let body = $response.body;

if (!body) {
    $done({});
}

// 1. 直接在 JSON 数据中暴力匹配标准番号 (如 SSIS-123, MIDV-001)
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body.match(idReg);

if (match && match[1]) {
    let code = match[1].toLowerCase();
    console.log(`[JavDB-SenPlayer] 成功抓取到番号: ${code}`);

    let jableUrl = `https://jable.tv/videos/${code}/`;

    // 2. 异步请求 Jable 页面
    $httpClient.get({
        url: jableUrl,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        }
    }, function(error, response, data) {
        if (!error && response.status === 200) {
            
            // 3. 正则提取网页底层的 m3u8 串流链接
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/;
            let m3u8Match = data.match(m3u8Reg);

            if (m3u8Match) {
                let m3u8 = m3u8Match[0];
                let senplayerUrl = `senplayer://${m3u8}`;
                
                // 4. 发送唤醒 SenPlayer 的交互弹窗
                if (typeof $environment !== 'undefined' && $environment['stash-version']) {
                    $notification.post(`▶ 解析成功: ${code.toUpperCase()}`, "Jable 视频源已找到", "👇 点击此通知立即拉起 SenPlayer 播放", { url: senplayerUrl });
                } else {
                    $notification.post(`▶ 解析成功: ${code.toUpperCase()}`, "Jable 视频源已找到", "👇 点击此通知立即拉起 SenPlayer 播放", senplayerUrl);
                }
            } else {
                console.log(`[JavDB-SenPlayer] 影片 ${code} 暂无 Jable 资源`);
            }
        } else {
            console.log(`[JavDB-SenPlayer] 访问 Jable 失败`);
        }
        
        // 释放请求，让 App 正常显示详情页
        $done({ body });
    });
} else {
    $done({ body });
}