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

                    // 4. Jable 均未找到，转去 123AV
                    if (!foundM3u8C) {
                        console.log(`[JavDB-SenPlayer] ⚠️ Jable 均未找到或被拦截，转去 123AV...`);
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
// 核心：处理 123AV 穿透抓取与诊断
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
        
        // 处理重定向
        if (resp.status === 301 || resp.status === 302 || resp.status === 308) {
            let location = resp.headers['Location'] || resp.headers['location'];
            if (location) {
                if (location.startsWith('/')) location = "https://123av.com" + location;
                console.log(`[JavDB-SenPlayer] 🔄 自动跟随重定向至: ${location}`);
                fetch123AV(location, code, step + 1);
            } else {
                $done({ body });
            }
            return;
        }
        
        if (resp.status === 200 || resp.status === 404) {
            let unescapedData = (data && resp.status === 200) ? data.replace(/\\/g, "") : "";
            
            // 【核心诊断】：打印当前页面的 Title，瞬间判断是否被反爬虫拦截！
            if (resp.status === 200) {
                let titleMatch = unescapedData.match(/<title>([^<]+)<\/title>/i);
                console.log(`[JavDB-SenPlayer] 📄 页面标题: ${titleMatch ? titleMatch[1].trim() : "无标题"}`);
            }
            
            // 1. 直接提取当前页面的直链
            let streamUrl = findStream(unescapedData, "https://123av.com");
            if (streamUrl && resp.status === 200) {
                handleSuccess(code, streamUrl, "123AV");
                return;
            }
            
            console.log(`[JavDB-SenPlayer] ⚠️ 123AV 当前路径(${resp.status})未找到直链。`);

            // 2. 找不到时按层级深挖
            if (step === 0) {
                // 第 0 层：在视频页中找内嵌的 iframe 或 video 播放器
                let iframeUrl = extractIframe(unescapedData);
                if (iframeUrl && resp.status === 200) {
                    console.log(`[JavDB-SenPlayer] 🔍 视频页发现内置播放器，钻入: ${iframeUrl}`);
                    fetch123AV(iframeUrl, code, 3);
                } else {
                    console.log(`[JavDB-SenPlayer] 尝试使用搜索接口...`);
                    fetch123AV(`https://123av.com/zh/search?q=${code}`, code, 1);
                }
            } else if (step === 1) {
                // 第 1 层：搜索页，提取真实的详情页链接 (兼容番号去掉了横杠的情况，如 zmar158)
                let pureCode = code.replace("-", "");
                let linkReg = new RegExp(`href=["']([^"']*(?:${code}|${pureCode})[^"']*)["']`, "i");
                let linkMatch = unescapedData.match(linkReg);
                
                if (linkMatch && linkMatch[1]) {
                    let nextUrl = linkMatch[1].startsWith('/') ? "https://123av.com" + linkMatch[1] : linkMatch[1];
                    console.log(`[JavDB-SenPlayer] 🔗 搜索页提取到视频: ${nextUrl}`);
                    fetch123AV(nextUrl, code, 2);
                } else {
                    console.log(`[JavDB-SenPlayer] ❌ 搜索结果中未匹配到该影片`);
                    $done({ body });
                }
            } else if (step === 2) {
                // 第 2 层：在搜索进来的视频页里再找 iframe
                let iframeUrl = extractIframe(unescapedData);
                if (iframeUrl) {
                    console.log(`[JavDB-SenPlayer] 🔍 详情页发现播放器，钻入: ${iframeUrl}`);
                    fetch123AV(iframeUrl, code, 3);
                } else {
                    $done({ body });
                }
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
// 提取 M3U8/MP4 直链 (兼容相对路径)
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
// 提取内嵌播放器链接 (增强兼容 video, source, data-src)
// ==========================================
function extractIframe(html) {
    if (!html) return null;
    // 匹配 iframe 或 video 标签
    let iframeReg = /<(?:iframe|video)[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
    let match;
    while ((match = iframeReg.exec(html)) !== null) {
        let url = match[1];
        if (!url.includes("ads") && !url.includes("banner") && !url.includes("ad.html")) {
            if (url.startsWith("//")) url = "https:" + url;
            if (url.startsWith("/")) url = "https://123av.com" + url;
            return url;
        }
    }
    // 匹配 source 标签
    let sourceReg = /<source[^>]+src=["']([^"']+)["']/gi;
    if ((match = sourceReg.exec(html)) !== null) {
        let url = match[1];
        if (url.startsWith("//")) url = "https:" + url;
        if (url.startsWith("/")) url = "https://123av.com" + url;
        return url;
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