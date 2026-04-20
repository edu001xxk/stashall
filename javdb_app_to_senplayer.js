let body = typeof $response !== 'undefined' ? $response.body : null;

if (body) {
    // 1. 匹配标准番号
    let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
    let match = body.match(idReg);

    if (match && match[1]) {
        let code = match[1].toLowerCase();
        console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);

        let jableUrl = `https://jable.tv/videos/${code}/`;

        // 2. 优先请求 Jable
        $httpClient.get({
            url: jableUrl,
            headers: getFakeHeaders()
        }, function(error, response, data) {
            let foundM3u8 = false;

            if (!error && response && response.status === 200) {
                let m3u8Url = findStream(data, "https://jable.tv");
                if (m3u8Url) {
                    foundM3u8 = true;
                    handleSuccess(code, m3u8Url, "Jable");
                }
            }
            
            // 3. Jable没找到，尝试带 -c 后缀
            if (!foundM3u8) {
                console.log(`[JavDB-SenPlayer] ⚠️ Jable 未找到，尝试加上 -c 后缀...`);
                let jableUrlC = `https://jable.tv/videos/${code}-c/`;
                
                $httpClient.get({
                    url: jableUrlC,
                    headers: getFakeHeaders()
                }, function(errC, respC, dataC) {
                    let foundM3u8C = false;

                    if (!errC && respC && respC.status === 200) {
                        let m3u8UrlC = findStream(dataC, "https://jable.tv");
                        if (m3u8UrlC) {
                            foundM3u8C = true;
                            handleSuccess(code, m3u8UrlC, "Jable");
                        }
                    }

                    // 4. Jable 均未找到，直接启动 123AV API 劫持
                    if (!foundM3u8C) {
                        console.log(`[JavDB-SenPlayer] ⚠️ Jable 均未找到，转去 123AV...`);
                        fetch123AV(code, false);
                    }
                });
            }
        });
    } else {
        $done({ body });
    }
} else {
    $done({});
}

// ==========================================
// 核心：处理 123AV 两步走抓取逻辑 (直捣 API)
// ==========================================
function fetch123AV(code, isRetry) {
    let targetCode = isRetry ? `${code}-c` : code;
    let url = `https://123av.com/zh/v/${targetCode}`;

    // 第一步：请求主页源码，寻找隐藏的纯数字内部 ID
    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (err || !resp) {
            $done({ body });
            return;
        }

        if (resp.status === 200) {
            // 用正则提取类似于 Movie({id: 375899, code: '...'}) 中的 ID
            let idMatch = data.match(/Movie\(\s*\{[^}]*id:\s*(\d+)/i);
            
            if (idMatch && idMatch[1]) {
                let internalId = idMatch[1];
                console.log(`[JavDB-SenPlayer] 🔓 成功提取 123AV 内部ID: ${internalId} (${targetCode})`);
                
                // 拿到 ID，执行第二步
                fetch123AVApi(internalId, code, targetCode);
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ 网页中未提取到内部 ID`);
                if (!isRetry) fetch123AV(code, true); // 尝试 -c 后缀的网页
                else $done({ body });
            }
        } else if (resp.status === 404) {
            if (!isRetry) {
                console.log(`[JavDB-SenPlayer] ⚠️ 123AV 网页不存在，尝试 -c 后缀...`);
                fetch123AV(code, true);
            } else {
                $done({ body });
            }
        } else {
            console.log(`[JavDB-SenPlayer] ❌ 123AV 访问异常，状态码: ${resp.status}`);
            $done({ body });
        }
    });
}

// 第二步：拿着内部 ID，直接向隐藏 API 索要真实的直链
function fetch123AVApi(internalId, code, targetCode) {
    let apiUrl = `https://123av.com/zh/ajax/v/${internalId}/videos`;
    
    $httpClient.get({
        url: apiUrl,
        // 这里必须伪装成浏览器的 AJAX 请求，否则会被服务器拒绝
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest", // 关键防伪造头
            "Referer": `https://123av.com/zh/v/${targetCode}`,
            "Accept-Language": "zh-CN,zh-Hans;q=0.9"
        }
    }, function(err, resp, data) {
        if (err || !resp || resp.status !== 200) {
            console.log(`[JavDB-SenPlayer] ❌ 123AV API 请求失败，状态码: ${resp ? resp.status : '网络错误'}`);
            $done({ body });
            return;
        }

        // 把服务器返回的数据(可能是 JSON 里的转义字符)进行反转义处理
        let dataStr = data ? data.replace(/\\/g, "") : "";
        let streamUrl = findStream(dataStr, "https://123av.com");

        if (streamUrl) {
            handleSuccess(code, streamUrl, "123AV");
        } else {
            console.log(`[JavDB-SenPlayer] ❌ 123AV API 响应中未找到直链！诊断数据: ${dataStr.substring(0, 100)}`);
            $done({ body });
        }
    });
}

// ==========================================
// 提取 M3U8/MP4 直链 (兼容各种坑爹路径)
// ==========================================
function findStream(data, domain) {
    if (!data) return null;
    
    // 匹配包含 http 的绝对路径，或者 // 开头的相对路径
    let streamReg = /(?:https?:)?\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/i;
    let match = data.match(streamReg);
    if (match) {
        let url = match[0];
        if (url.startsWith("//")) url = "https:" + url;
        return url;
    }
    
    // 匹配 / 开头的本地相对路径
    let relReg = /["'](\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*)/i;
    let relMatch = data.match(relReg);
    if (relMatch) {
        return domain + relMatch[1];
    }
    return null;
}

// ==========================================
// 伪装普通请求头
// ==========================================
function getFakeHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Connection": "keep-alive"
    };
}

// ==========================================
// 提取成功后的处理函数
// ==========================================
function handleSuccess(code, url, source) {
    console.log(`\n==================================`);
    console.log(`🎯 [成功获取资源] 数据源: ${source}`);
    console.log(`🔗 播放链接: ${url}`);
    console.log(`==================================\n`);
    
    let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(url)}`;
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