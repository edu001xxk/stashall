let body = $response.body;

if (!body) {
    $done({});
}

// 1. 匹配标准番号
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body.match(idReg);

if (match && match[1]) {
    let code = match[1].toLowerCase();
    console.log(`[JavDB-SenPlayer] 开始为您搜索番号: ${code}`);

    let jableUrl = `https://jable.tv/videos/${code}/`;

    // 2. 优先请求 Jable
    $httpClient.get({
        url: jableUrl,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        }
    }, function(error, response, data) {
        let foundM3u8 = false;

        // 如果 Jable 访问成功，尝试提取
        if (!error && response.status === 200) {
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = data.match(m3u8Reg);

            if (m3u8Match) {
                foundM3u8 = true;
                handleSuccess(code, m3u8Match[0], "Jable");
            }
        }
        
        // 3. 备用方案：如果 Jable 没找到或请求失败，转而搜索 MissAV
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] Jable 未找到，自动切换至 MissAV 搜索...`);
            let missavUrl = `https://missav.com/en/${code}`;
            
            $httpClient.get({
                url: missavUrl,
                headers: {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
                }
            }, function(mError, mResponse, mData) {
                if (!mError && (mResponse.status === 200 || mResponse.status === 301 || mResponse.status === 302)) {
                    // MissAV 的链接通常被斜杠转义，先去除转义符，再进行匹配
                    let unescapedData = mData.replace(/\\/g, "");
                    let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
                    let m3u8Match = unescapedData.match(m3u8Reg);

                    if (m3u8Match) {
                        handleSuccess(code, m3u8Match[0], "MissAV");
                    } else {
                        console.log(`[JavDB-SenPlayer] 😭 抱歉，Jable 和 MissAV 均未找到该影片资源`);
                        $done({ body });
                    }
                } else {
                    console.log(`[JavDB-SenPlayer] MissAV 请求失败`);
                    $done({ body });
                }
            });
        }
    });
} else {
    // 没找到番号，直接放行
    $done({ body });
}

// 提取成功后的统一处理函数（打印日志 + 发送通知）
function handleSuccess(code, m3u8, source) {
    // 【新增】将 m3u8 链接高亮打印到 Stash 日志中
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
    
    // 释放请求，让 App 继续加载
    $done({ body });
}
