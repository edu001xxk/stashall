let body = $response.body;
if (!body) { $done({}); }

// 1. 匹配标准番号 (如 MIKR-089)
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body.match(idReg);

if (match && match[1]) {
    let code = match[1].toLowerCase();
    console.log(`\n[JavDB-Debug] 🔍 开始搜索番号: ${code.toUpperCase()}`);

    // --- 第一站：Jable ---
    let jableUrl = `https://jable.tv/videos/${code}/`;
    $httpClient.get({
        url: jableUrl,
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" }
    }, function(error, response, data) {
        let found = false;
        if (!error && response.status === 200) {
            let m3u8Match = data.match(/https?:\/\/[^"'\s<>]+\.m3u8/i);
            if (m3u8Match) {
                found = true;
                handleSuccess(code, m3u8Match[0], "Jable");
            }
        }

        // --- 第二站：MissAV (如果 Jable 没中) ---
        if (!found) {
            console.log(`[JavDB-Debug] ⚠️ Jable 未命中，尝试 MissAV...`);
            // 尝试直接访问影片页
            fetchMissAV(`https://missav.ai/cn/${code}`, code, 0);
        }
    });
} else {
    $done({ body });
}

function fetchMissAV(url, code, retry) {
    if (retry > 2) { 
        console.log(`[JavDB-Debug] ❌ MissAV 搜索终了，未发现资源`);
        $done({}); return; 
    }
    
    $httpClient.get({
        url: url,
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" }
    }, function(err, resp, data) {
        if (!err && (resp.status === 200 || resp.status === 301 || resp.status === 302)) {
            // 处理重定向
            if (resp.status === 301 || resp.status === 302) {
                let loc = resp.headers['Location'] || resp.headers['location'];
                fetchMissAV(loc, code, retry + 1);
                return;
            }
            // 暴力清除所有转义斜杠再匹配
            let cleanData = data.replace(/\\/g, "");
            let m3u8Match = cleanData.match(/https?:\/\/[^"'\s<>]+\.m3u8/i);
            
            if (m3u8Match) {
                handleSuccess(code, m3u8Match[0], "MissAV");
            } else {
                console.log(`[JavDB-Debug] ❌ MissAV 页面加载成功但未发现 m3u8 (可能该番号需搜索)`);
                // 最后的挣扎：尝试搜索页
                if (retry === 0) fetchMissAV(`https://missav.ai/cn/search/${code}`, code, 1);
                else $done({});
            }
        } else {
            console.log(`[JavDB-Debug] ❌ MissAV 请求失败，状态码: ${resp ? resp.status : 'ERR'}`);
            $done({});
        }
    });
}

function handleSuccess(code, m3u8, source) {
    console.log(`\n🎯 [找到资源] 源: ${source} | 番号: ${code.toUpperCase()}`);
    console.log(`🔗 链接: ${m3u8}\n`);
    
    // 确保快捷指令名字 JavPlay 准确无误
    let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(m3u8)}`;
    
    $notification.post(
        `▶ 解析成功 (${source}): ${code.toUpperCase()}`, 
        "点击此通知立即播放", 
        m3u8, 
        shortcutUrl
    );
    $done({ body: $response.body });
}