var body = typeof $response !== 'undefined' ? $response.body : null;

if (body) {
    // 1. 匹配标准番号
    var idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
    var match = body.match(idReg);

    if (match && match[1]) {
        var code = match[1].toLowerCase();
        console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);

        var jableUrl = `https://jable.tv/videos/${code}/`;

        // 2. 优先请求 Jable
        $httpClient.get({
            url: jableUrl,
            headers: getFakeHeaders()
        }, function(error, response, data) {
            var foundM3u8 = false;

            if (!error && response && response.status === 200) {
                var m3u8Url = findStream(data, "https://jable.tv");
                if (m3u8Url) {
                    foundM3u8 = true;
                    handleSuccess(code, m3u8Url, "Jable");
                }
            }
            
            // 3. Jable没找到，尝试带 -c 后缀
            if (!foundM3u8) {
                console.log(`[JavDB-SenPlayer] ⚠️ Jable 未找到，尝试加上 -c 后缀...`);
                var jableUrlC = `https://jable.tv/videos/${code}-c/`;
                
                $httpClient.get({
                    url: jableUrlC,
                    headers: getFakeHeaders()
                }, function(errC, respC, dataC) {
                    var foundM3u8C = false;

                    if (!errC && respC && respC.status === 200) {
                        var m3u8UrlC = findStream(dataC, "https://jable.tv");
                        if (m3u8UrlC) {
                            foundM3u8C = true;
                            handleSuccess(code, m3u8UrlC, "Jable");
                        }
                    }

                    // 4. Jable 均未找到，转去 123AV 抓取内部 ID
                    if (!foundM3u8C) {
                        console.log(`[JavDB-SenPlayer] ⚠️ Jable 均未找到，转去 123AV 提取底层接口...`);
                        fetch123AV(`https://123av.com/zh/v/${code}`, code, 0);
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
// 核心：123AV API 隐秘抓取
// ==========================================
function fetch123AV(url, code, step) {
    if (step > 3) {
        console.log(`[JavDB-SenPlayer] ❌ 123AV 尝试路径耗尽，已停止请求`);
        $done({ body });
        return;
    }
    
    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (err || !resp) {
            console.log(`[JavDB-SenPlayer] ❌ 123AV 网络请求直接报错`);
            $done({ body });
            return;
        }
        
        if (resp.status === 403 || resp.status === 503) {
            console.log(`[JavDB-SenPlayer] 🛡️ 遭遇 CF 盾拦截！状态码: ${resp.status}`);
            $done({ body });
            return;
        }
        
        if (resp.status === 301 || resp.status === 302 || resp.status === 308) {
            var location = resp.headers['Location'] || resp.headers['location'];
            if (location) {
                if (location.startsWith('/')) location = "https://123av.com" + location;
                fetch123AV(location, code, step + 1);
            } else {
                $done({ body });
            }
            return;
        }
        
        if (resp.status === 200 || resp.status === 404) {
            var unescapedData = (data && resp.status === 200) ? data.replace(/\\/g, "") : "";
            
            // 全局拦截直链（哪怕在 API 响应的 JSON 里，也能被这个正则直接吸出来）
            var streamUrl = findStream(unescapedData, "https://123av.com");
            if (streamUrl && resp.status === 200) {
                handleSuccess(code, streamUrl, "123AV (API)");
                return;
            }

            // 逻辑分流
            if (step === 0) {
                // 第 0 层：在网页源码中提取内部的 ID (如 375899)
                var idMatch = unescapedData.match(/Movie\(\{.*?id:\s*(\d+)/i) || unescapedData.match(/id:\s*(\d+),\s*code:\s*['"][^'"]+['"]/i);
                
                if (idMatch && idMatch[1]) {
                    var movieId = idMatch[1];
                    console.log(`[JavDB-SenPlayer] 🔑 提取到内部ID: ${movieId}，正在请求隐藏 API...`);
                    // 找到了！直接发起隐藏 API 请求！
                    var apiUrl = `https://123av.com/zh/ajax/v/${movieId}/videos`;
                    fetch123AV(apiUrl, code, 3);
                } else {
                    console.log(`[JavDB-SenPlayer] ⚠️ 未提取到内部ID，尝试使用搜索接口...`);
                    fetch123AV(`https://123av.com/zh/search?q=${code}`, code, 1);
                }
            } else if (step === 1) {
                // 第 1 层：搜索页寻找真实链接
                var pureCode = code.replace("-", "");
                var linkReg = new RegExp(`href=["']([^"']*(?:${code}|${pureCode})[^"']*)["']`, "i");
                var linkMatch = unescapedData.match(linkReg);
                
                if (linkMatch && linkMatch[1]) {
                    var nextUrl = linkMatch[1].startsWith('/') ? "https://123av.com" + linkMatch[1] : linkMatch[1];
                    console.log(`[JavDB-SenPlayer] 🔗 搜索页提取到视频: ${nextUrl}`);
                    fetch123AV(nextUrl, code, 0); // 回到 step 0 提取 ID
                } else {
                    console.log(`[JavDB-SenPlayer] ❌ 搜索结果中未找到该影片`);
                    $done({ body });
                }
            } else if (step === 3) {
                // 第 3 层：API 接口已经返回，但没抓到 m3u8
                console.log(`[JavDB-SenPlayer] ❌ 隐藏 API 未返回视频直链，可能需要登录或解析失败`);
                $done({ body });
            } else {
                $done({ body });
            }
        } else {
            console.log(`[JavDB-SenPlayer] ❌ 未知错误，状态码: ${resp.status}`);
            $done({ body });
        }
    });
}

// ==========================================
// 提取 M3U8/MP4 直链 (超强兼容正则，直接吸取 JSON 里的链接)
// ==========================================
function findStream(data, domain) {
    if (!data) return null;
    var streamReg = /(?:https?:)?\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/i;
    var match = data.match(streamReg);
    if (match) {
        var url = match[0];
        if (url.startsWith("//")) url = "https:" + url;
        return url;
    }
    
    var relReg = /["'](\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*)/i;
    var relMatch = data.match(relReg);
    if (relMatch) {
        return domain + relMatch[1];
    }
    return null;
}

// ==========================================
// 伪装请求头 (增加了 API 所需的特定头)
// ==========================================
function getFakeHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "application/json, text/javascript, text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8",
        "X-Requested-With": "XMLHttpRequest", // 骗过 123AV，假装我们是 Ajax 请求
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
    
    var shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(url)}`;
    var title = `▶ 解析成功 (${source}): ${code.toUpperCase()}`;
    var subtitle = `已找到串流链接并记录至日志`;
    var content = `👇 点击弹窗立即拉起 SenPlayer`;

    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    $done({ body });
}