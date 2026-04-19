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
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
        }
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
        
        // 3. Jable 没找到，转去 MissAV
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] Jable 未找到，切换至 MissAV...`);
            // 使用最新域名 missav.ai，并传入初始跳转计数器 0
            let missavUrl = `https://missav.ai/cn/${code}`;
            fetchMissAV(missavUrl, code, 0);
        }
    });
} else {
    $done({ body });
}

// ==========================================
// 独立封装 MissAV 的请求函数，支持自动跟随重定向
// ==========================================
function fetchMissAV(url, code, redirectCount) {
    // 防止陷入死循环，最多允许跳 3 次域名
    if (redirectCount > 3) {
        console.log(`[JavDB-SenPlayer] MissAV 重定向次数过多，已停止请求`);
        $done({ body });
        return;
    }
    
    console.log(`[JavDB-SenPlayer] 正在请求 MissAV: ${url}`);
    
    $httpClient.get({
        url: url,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
        }
    }, function(err, resp, data) {
        if (err) {
            console.log(`[JavDB-SenPlayer] MissAV 请求报错: ${err}`);
            $done({ body });
            return;
        }
        
        console.log(`[JavDB-SenPlayer] MissAV 返回状态码: ${resp.status}`);
        
        // 【核心修复】处理 301/302 重定向
        if (resp.status === 301 || resp.status === 302 || resp.status === 308) {
            let location = resp.headers['Location'] || resp.headers['location'];
            if (location) {
                // 如果返回的是相对路径，手动拼上域名
                if (location.startsWith('/')) {
                    let domain = url.match(/^https?:\/\/[^\/]+/)[0];
                    location = domain + location;
                }
                console.log(`[JavDB-SenPlayer] 发现重定向，自动跟随至: ${location}`);
                // 递归发起新请求
                fetchMissAV(location, code, redirectCount + 1);
            } else {
                $done({ body });
            }
            return;
        }
        
        // 处理 200 成功响应
        if (resp.status === 200) {
            let unescapedData = data.replace(/\\/g, "");
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = unescapedData.match(m3u8Reg);

            if (m3u8Match) {
                handleSuccess(code, m3u8Match[0], "MissAV");
            } else {
                console.log(`[JavDB-SenPlayer] 😭 抱歉，MissAV 页面内未提取到 m3u8 链接`);
                $done({ body });
            }
        } else {
            $done({ body });
        }
    });
}

// ==========================================
// 提取成功后的统一处理函数 (发送通知 + 打印日志)
// ==========================================
function handleSuccess(code, m3u8, source) {
    // 华丽地打印到 Stash 日志中，方便复制
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