let body = $response.body;

if (!body) {
    $done({});
}

// 1. 匹配标准番号
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body.match(idReg);

if (match && match[1]) {
    let code = match[1].toLowerCase();
    console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);

    // 把 Jable 请求封装成函数，方便失败时自动尝试 -c 后缀
    function fetchJable(targetCode, isRetry) {
        let jableUrl = `https://jable.tv/videos/${targetCode}/`;
        
        $httpClient.get({
            url: jableUrl,
            headers: getFakeHeaders()
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
            
            if (!foundM3u8) {
                if (!isRetry) {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 原番号未找到，尝试追加中文字幕后缀 (-c) ...`);
                    fetchJable(`${code}-c`, true); // 自动重试带 -c 的版本
                } else {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 均未找到或被拦截，转去 123AV...`);
                    // 123AV 首选尝试真实的视频页路径 /zh/v/番号
                    fetch123AV(`https://123av.com/zh/v/${code}`, code, 0);
                }
            }
        });
    }

    // 触发 Jable 首次请求
    fetchJable(code, false);

} else {
    $done({ body });
}

// ==========================================
// 核心：处理 123AV 请求
// ==========================================
function fetch123AV(url, code, step) {
    if (step > 4) {
        console.log(`[JavDB-SenPlayer] ❌ 123AV 尝试路径过多，已停止请求`);
        $done({ body });
        return;
    }
    
    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (err || resp.status === 403 || resp.status === 503) {
            console.log(`[JavDB-SenPlayer] ❌ 123AV 请求报错或被拦截，状态码: ${resp ? resp.status : '网络错误'}`);
            $done({ body });
            return;
        }
        
        if (resp.status === 301 || resp.status === 302 || resp.status === 308) {
            let location = resp.headers['Location'] || resp.headers['location'];
            if (location) {
                if (location.startsWith('/')) {
                    let domain = url.match(/^https?:\/\/[^\/]+/)[0];
                    location = domain + location;
                }
                console.log(`[JavDB-SenPlayer] 🔄 自动跟随重定向至: ${location}`);
                fetch123AV(location, code, step + 1);
            } else {
                $done({ body });
            }
            return;
        }

        if (resp.status === 404) {
            console.log(`[JavDB-SenPlayer] ⚠️ 路径 404 不存在: ${url}`);
            tryNext123AVPath(code, step);
            return;
        }
        
        if (resp.status === 200) {
            let unescapedData = data.replace(/\\/g, "");
            
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = unescapedData.match(m3u8Reg);

            if (m3u8Match) {
                handleSuccess(code, m3u8Match[0], "123AV");
                return;
            } 
            
            let videoLinkReg = new RegExp(`href="([^"]*(?:video|v|play|watch|movie)[^"]*${code}[^"]*)"`, "i");
            let linkMatch = unescapedData.match(videoLinkReg);
            
            if (linkMatch && linkMatch[1]) {
                let nextUrl = linkMatch[1];
                if (nextUrl.startsWith('/')) {
                    nextUrl = "https://123av.com" + nextUrl;
                }
                console.log(`[JavDB-SenPlayer] 🔗 搜索页匹配到详情页: ${nextUrl}，正在进入...`);
                fetch123AV(nextUrl, code, step + 1);
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ 当前页面(200) 未找到 m3u8，也未找到对应的详情页链接。`);
                tryNext123AVPath(code, step);
            }
        } else {
            console.log(`[JavDB-SenPlayer] ❌ 未知错误，状态码: ${resp.status}`);
            $done({ body });
        }
    });
}

// ==========================================
// 辅助路由：根据步数尝试不同的 123AV 网址结构
// ==========================================
function tryNext123AVPath(code, step) {
    if (step === 0) {
        // 第一备选：如果原番号 /v/ 报错，尝试 123AV 的 -c 后缀视频页
        console.log(`[JavDB-SenPlayer] 🔄 尝试 123AV 中文字幕后缀路径...`);
        fetch123AV(`https://123av.com/zh/v/${code}-c`, code, 1);
    } else if (step === 1) {
        // 第二备选：进入搜索列表页
        console.log(`[JavDB-SenPlayer] 🔄 尝试备用搜索参数 q=...`);
        fetch123AV(`https://123av.com/zh/search?q=${code}`, code, 2);
    } else {
        console.log(`[JavDB-SenPlayer] ❌ 所有已知 123AV 路径规则均已耗尽，提取失败。`);
        $done({ body });
    }
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
function handleSuccess(code, m3u8, source) {
    console.log(`\n==================================`);
    console.log(`🎯 [成功获取 M3U8] 数据源: ${source}`);
    console.log(`🔗 播放链接: ${m3u8}`);
    console.log(`==================================\n`);
    
    // 【注意】这里保留了你之前要求退回的 Shortcuts 唤醒代码。
    // 如果你想用回免跳转方案，请把下面的内容换成伪装 HTTPS 链接的版本。
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