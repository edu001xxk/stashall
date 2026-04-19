let url = $request.url;

// ==========================================
// 逻辑一：如果拦截到的是通知弹窗跳转过来的网页
// ==========================================
if (url.includes("senplayer_redirect")) {
    // 从 URL 中提取编码后的 m3u8 链接
    let targetUrl = url.split("url=")[1];
    
    // 组装最终的 SenPlayer 唤醒协议
    let schemeUrl = `senplayer://x-callback-url/play?url=${targetUrl}`;
    
    // 构造一个好看的中转 HTML 页面
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>跳转 SenPlayer</title>
        <style>
            body { background-color: #121212; color: #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: -apple-system, sans-serif; }
            .btn { background-color: #E50914; color: white; padding: 15px 30px; border-radius: 25px; text-decoration: none; font-weight: bold; font-size: 18px; margin-top: 20px; box-shadow: 0 4px 10px rgba(229, 9, 20, 0.4); }
        </style>
        <script>
            // 页面加载后延迟 0.5 秒，自动发起跳转
            setTimeout(function() {
                window.location.href = "${schemeUrl}";
            }, 500);
        </script>
    </head>
    <body>
        <h2 style="margin-bottom: 10px;">正在呼叫 SenPlayer 🚀</h2>
        <p style="color: #888; font-size: 14px;">如果没有自动跳转，请点击下方按钮</p>
        <a href="${schemeUrl}" class="btn">▶ 立即播放</a>
    </body>
    </html>
    `;
    
    // 阻断原请求，直接给浏览器返回这个 HTML 网页
    $done({
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: html
    });
} 
// ==========================================
// 逻辑二：如果拦截到的是 App 内部的影片详情接口
// ==========================================
else {
    let body = $response.body;
    if (!body) { $done({}); }

    let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
    let match = body.match(idReg);

    if (match && match[1]) {
        let code = match[1].toLowerCase();
        let jableUrl = `https://jable.tv/videos/${code}/`;

        $httpClient.get({
            url: jableUrl,
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            }
        }, function(error, response, data) {
            if (!error && response.status === 200) {
                let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/;
                let m3u8Match = data.match(m3u8Reg);

                if (m3u8Match) {
                    let m3u8 = m3u8Match[0];
                    // 核心：生成伪装的 HTTPS 跳转网页链接
                    let redirectUrl = `https://apidd.btyjscl.com/senplayer_redirect?url=${encodeURIComponent(m3u8)}`;
                    
                    $notification.post(
                        `▶ 解析成功: ${code.toUpperCase()}`, 
                        "Jable 视频源已找到", 
                        "👇 点击此通知立即唤醒 SenPlayer", 
                        redirectUrl
                    );
                }
            }
            $done({ body });
        });
    } else {
        $done({ body });
    }
}