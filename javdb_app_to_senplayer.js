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

        // 如果 Jable 访问成功，尝试提取
        if (!error && response.status === 200) {
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = data.match(m3u8Reg);

            if (m3u8Match) {
                foundM3u8 = true;
                handleSuccess(code, m3u8Match[0], "Jable");
            }
        }
        
        // 3. 备用方案：Jable 没找到，转而搜索 MissAV
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] Jable 未找到，自动切换至 MissAV 搜索...`);
            // 使用新域名，并调用支持追踪重定向的函数
            fetchMissAV(`https://missav.ai/cn/${code}`, code, 0);
        }
    });
} else {
    // 没找到番号，直接放行
    $done({ body });
}

// ==========================================
// 处理 MissAV 域名跳转与搜索的核心函数
// ==========================================
function fetchMissAV(url, code, redirectCount) {
    // 防止陷入死循环，最多跳3次
    if (redirectCount > 3) {
        console.log(`[JavDB-SenPlayer] MissAV 重定向次数过多，已停止请求`);
        $done({ body });
        return;
    }
    
    $httpClient.get({
        url: url,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
        }
    }, function(err, resp, data) {
        if (err) {
            $done({ body });
            return;
        }
        
        // 核心：遇到 301/302 重定向，自动跟过去抓取
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
        
        // 如果是 200 成功响应，开始提取
        if (resp.status === 200) {
            // 去除转义符再匹配
            let unescapedData = data.replace(/\\/g, "");
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = unescapedData.match(m3u8Reg);

            if (m3u8Match) {
                handleSuccess(code, m3u8Match[0], "MissAV");
            } else {
                // 如果在详情页没搜到，试着去搜索页再抓一次
                if (redirectCount === 0) {
                    fetchMissAV(`https://missav.ai/cn/search/${code}`, code, 1);
                } else {
                    console.log(`[JavDB-SenPlayer] 😭 抱歉，MissAV 也未找到该影片资源`);
                    $done({ body });
                }
            }
        } else {
            $done({ body });
        }
    });
}

// ==========================================
// 提取成功后的统一处理函数（完全保留你验证过的正确跳转逻辑！）
// ==========================================
function handleSuccess(code, m3u8, source) {
    // 将 m3u8 链接高亮打印到 Stash 日志中
    console.log(`\n==================================`);
    console.log(`🎯 [成功获取 M3U8] 数据源: ${source}`);
    console.log(`🔗 播放链接: ${m3u8}`);
    console.log(`==================================\n`);
    
    let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(m3u8)}`;
    
    let title = `▶ 解析成功 (${source}): ${code.toUpperCase()}`;
    let subtitle = `已找到串流链接并记录至日志`;
    let content = `👇 点击弹窗立即拉起 SenPlayer`;

    // 这一段必须严格保持这样，Stash 才能正确处理跳转！
    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    
    // 释放请求，让 App 继续加载
    $done({ body });
}