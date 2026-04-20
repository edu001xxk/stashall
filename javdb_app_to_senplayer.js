let body = $response.body;

if (!body) {
    $done({});
    return;
}

// 1. 匹配标准番号
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body.match(idReg);

if (match && match[1]) {
    let code = match[1].toLowerCase();
    console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);
    runJableSearch(code);
} else {
    $done({ body });
}

// ==========================================
// 独立函数 1：请求 Jable 原番号
// ==========================================
function runJableSearch(code) {
    let jableUrl = `https://jable.tv/videos/${code}/`;
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
        
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 原番号未找到，尝试带 -c 后缀...`);
            runJableCSearch(code);
        }
    });
}

// ==========================================
// 独立函数 2：请求 Jable -c 后缀
// ==========================================
function runJableCSearch(code) {
    let jableUrlC = `https://jable.tv/videos/${code}-c/`;
    $httpClient.get({
        url: jableUrlC,
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
        
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 均未找到，转去 123AV...`);
            fetch123AV(`https://123av.com/zh/v/${code}`, code, 0);
        }
    });
}

// ==========================================
// 独立函数 3：处理 123AV 穿透抓取 (全新状态机)
// ==========================================
function fetch123AV(url, code, step) {
    if (step > 3) {
        console.log(`[JavDB-SenPlayer] ❌ 123AV 尝试路径耗尽，未找到资源`);
        $done({ body });
        return;
    }
    
    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (err || !resp) {
            console.log(`[JavDB-SenPlayer] ❌ 123AV 网络请求报错`);
            $done({ body });
            return;
        }
        
        if (resp.status === 403 || resp.status === 503) {
            console.log(`[JavDB-SenPlayer] 🛡️ 123AV 遭遇 CF 拦截！`);
            $done({ body });
            return;
        }
        
        // 自动跟随重定向
        if (resp.status >= 300 && resp.status < 400) {
            let location = resp.headers['Location'] || resp.headers['location'];
            if (location) {
                if (location.startsWith('/')) location = "https://123av.com" + location;
                fetch123AV(location, code, step);
            } else {
                $done({ body });
            }
            return;
        }
        
        let unescapedData = (data && resp.status === 200) ? data.replace(/\\/g, "") : "";
        let streamUrl = findStream(unescapedData, "https://123av.com");

        // 无论在哪一层，只要当前页面有视频流直链，直接成功
        if (streamUrl && resp.status === 200) {
            handleSuccess(code, streamUrl, "123AV");
            return;
        }
        
        // 状态机处理不同层级的解析逻辑
        if (step === 0) {
            // 第 0 层：直接访问番号视频页
            if (resp.status === 200) {
                let iframeUrl = extractIframe(unescapedData);
                if (iframeUrl) {
                    console.log(`[JavDB-SenPlayer] 🔍 视频页发现内置播放器(iframe)，钻入抓取: ${iframeUrl}`);
                    fetch123AV(iframeUrl, code, 3);
                } else {
                    console.log(`[JavDB-SenPlayer] ⚠️ 视频页未找到直链或播放器，退回尝试搜索...`);
                    fetch123AV(`https://123av.com/zh/search?q=${code}`, code, 1);
                }
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ 视频页(${resp.status})不存在，尝试搜索...`);
                fetch123AV(`https://123av.com/zh/search?q=${code}`, code, 1);
            }
        } 
        else if (step === 1) {
            // 第 1 层：搜索结果页
            if (resp.status === 200) {
                // 在搜索结果代码中，精准提取 /v/xxx 格式的真实视频链接
                let linkMatch = unescapedData.match(/href=["']([^"']*\/v\/[^"']+)["']/i);
                if (linkMatch && linkMatch[1]) {
                    let nextUrl = linkMatch[1].startsWith('/') ? "https://123av.com" + linkMatch[1] : linkMatch[1];
                    console.log(`[JavDB-SenPlayer] 🔗 搜索页提取到匹配视频: ${nextUrl}`);
                    fetch123AV(nextUrl, code, 2);
                } else {
                    console.log(`[JavDB-SenPlayer] ❌ 搜索页中未找到相关影片`);
                    $done({ body });
                }
            } else {
                $done({ body });
            }
        } 
        else if (step === 2) {
            // 第 2 层：通过搜索页提取到的真实视频页
            if (resp.status === 200) {
                let iframeUrl = extractIframe(unescapedData);
                if (iframeUrl) {
                    console.log(`[JavDB-SenPlayer] 🔍 真实视频页发现内置播放器，钻入抓取: ${iframeUrl}`);
                    fetch123AV(iframeUrl, code, 3);
                } else {
                    console.log(`[JavDB-SenPlayer] ❌ 真实视频页依然未找到资源`);
                    $done({ body });
                }
            } else {
                $done({ body });
            }
        } 
        else if (step === 3) {
            // 第 3 层：iframe 播放器页（最深的一层了）
            console.log(`[JavDB-SenPlayer] ❌ 最底层的 iframe 播放器中也未提取到直链`);
            $done({ body });
        }
    });
}

// ==========================================
// 辅助函数：提取 M3U8 或 MP4 (兼容相对/绝对路径)
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
// 辅助函数：提取嵌套播放器的 iframe 链接
// ==========================================
function extractIframe(html) {
    if (!html) return null;
    let iframeReg = /<iframe[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = iframeReg.exec(html)) !== null) {
        let url = match[1];
        // 过滤掉显而易见的广告代码
        if (!url.includes("ads") && !url.includes("banner") && !url.includes("ad.html")) {
            if (url.startsWith("//")) url = "https:" + url;
            if (url.startsWith("/")) url = "https://123av.com" + url;
            return url;
        }
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
        "Accept-Language": "zh-CN,zh-Hans;q=0.9"
    };
}

// ==========================================
// 成功回调处理
// ==========================================
function handleSuccess(code, url, source) {
    console.log(`\n==================================`);
    console.log(`🎯 [成功获取流媒体] 数据源: ${source}`);
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