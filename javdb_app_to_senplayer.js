let body = typeof $response !== 'undefined' ? $response.body : null;

// 安全的包裹层，彻底杜绝崩溃
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

                    // 4. Jable 均未找到，动用终极武器：请求 123AV 隐藏 API
                    if (!foundM3u8C) {
                        console.log(`[JavDB-SenPlayer] ⚠️ Jable 均未找到，正在劫持 123AV API...`);
                        fetch123AV_API(code);
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
// 核心：利用 POST 方法直接劫持 123AV API 数据
// ==========================================
function fetch123AV_API(code) {
    let timestamp = new Date().getTime();
    // 模仿你截图里的请求 URL
    let apiUrl = `https://123av.com/zh/v/${code}?timestamp=${timestamp}`;

    $httpClient.post({
        url: apiUrl,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Accept": "application/json, text/plain, */*",
            // 伪装成前端 Ajax 请求（极其关键，没有它服务器不会给数据）
            "X-Requested-With": "XMLHttpRequest",
            "Origin": "https://123av.com",
            "Referer": `https://123av.com/zh/v/${code}`
        }
    }, function(err, resp, data) {
        if (err || !resp) {
            console.log(`[JavDB-SenPlayer] ❌ 123AV API 请求直接报错`);
            $done({ body });
            return;
        }

        if (resp.status === 200) {
            // 直接拿到包含了那个 Token 链接的 JSON 文本
            let unescapedData = data ? data.replace(/\\/g, "") : "";
            
            // 暴力提取，不管 JSON 结构多深，直接抠出 m3u8
            let streamReg = /(?:https?:)?\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/i;
            let match = unescapedData.match(streamReg);

            if (match) {
                let finalUrl = match[0];
                if (finalUrl.startsWith("//")) finalUrl = "https:" + finalUrl;
                handleSuccess(code, finalUrl, "123AV");
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ 123AV API 中未找到直链，尝试带 -c 的接口...`);
                // 如果原番号没找到，顺手查一下带 -c 后缀的接口
                fetch123AV_API_C(`${code}-c`);
            }
        } else {
            console.log(`[JavDB-SenPlayer] ❌ 123AV API 状态码异常: ${resp.status}`);
            $done({ body });
        }
    });
}

function fetch123AV_API_C(codeC) {
    let timestamp = new Date().getTime();
    let apiUrl = `https://123av.com/zh/v/${codeC}?timestamp=${timestamp}`;

    $httpClient.post({
        url: apiUrl,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Accept": "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": "https://123av.com",
            "Referer": `https://123av.com/zh/v/${codeC}`
        }
    }, function(err, resp, data) {
        let unescapedData = (data && resp.status === 200) ? data.replace(/\\/g, "") : "";
        let streamReg = /(?:https?:)?\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/i;
        let match = unescapedData.match(streamReg);

        if (match && resp.status === 200) {
            let finalUrl = match[0];
            if (finalUrl.startsWith("//")) finalUrl = "https:" + finalUrl;
            handleSuccess(codeC, finalUrl, "123AV");
        } else {
            console.log(`[JavDB-SenPlayer] ❌ 123AV 资源彻底未找到。`);
            $done({ body });
        }
    });
}

// ==========================================
// 提取流媒体直链 (用于 Jable 和通用提取)
// ==========================================
function findStream(data, domain) {
    if (!data) return null;
    let streamReg = /(?:https?:)?\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/i;
    let match = data.match(streamReg);
    if (match) {
        let url = match[0];
        if (url.startsWith("//")) url = "https:" + url;
        return url;
    }
    
    let relReg = /["'](\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*)/i;
    let relMatch = data.match(relReg);
    if (relMatch) {
        return domain + relMatch[1];
    }
    return null;
}

// ==========================================
// 伪装请求头
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