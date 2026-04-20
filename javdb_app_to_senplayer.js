let body = $response.body;

if (!body) {
    $done({});
    return; // 防止空数据导致卡死
}

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
            let m3u8Url = findM3u8(data, "https://jable.tv");
            if (m3u8Url) {
                foundM3u8 = true;
                handleSuccess(code, m3u8Url, "Jable");
            }
        }
        
        // 3. Jable没找到，直接嵌套尝试 Jable -c 后缀 (彻底解决变量丢失报错)
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 未找到，尝试加上 -c 后缀...`);
            let jableUrlC = `https://jable.tv/videos/${code}-c/`;
            
            $httpClient.get({
                url: jableUrlC,
                headers: getFakeHeaders()
            }, function(errC, respC, dataC) {
                let foundM3u8C = false;

                if (!errC && respC && respC.status === 200) {
                    let m3u8UrlC = findM3u8(dataC, "https://jable.tv");
                    if (m3u8UrlC) {
                        foundM3u8C = true;
                        handleSuccess(code, m3u8UrlC, "Jable");
                    }
                }

                // 4. 备用方案：Jable -c也未找到，转而搜索 123AV
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

// ==========================================
// 核心：处理 123AV 请求与重试逻辑
// ==========================================
function fetch123AV(url, code, redirectCount) {
    if (redirectCount > 4) {
        console.log(`[JavDB-SenPlayer] ❌ 123AV 重定向次数过多，已停止请求`);
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
                if (location.startsWith('/')) {
                    location = "https://123av.com" + location;
                }
                console.log(`[JavDB-SenPlayer] 🔄 自动跟随重定向至: ${location}`);
                fetch123AV(location, code, redirectCount + 1);
            } else {
                $done({ body });
            }
            return;
        }
        
        if (resp.status === 200 || resp.status === 404) {
            let dataStr = (data && resp.status === 200) ? data.replace(/\\/g, "") : "";
            // 启用增强型正则提取
            let m3u8Url = findM3u8(dataStr, "https://123av.com");

            if (m3u8Url && resp.status === 200) {
                handleSuccess(code, m3u8Url, "123AV");
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ 123AV 当前路径(${resp.status})未找到m3u8。`);
                
                // 阶梯尝试 123AV 其他路径
                if (redirectCount === 0) {
                    console.log(`[JavDB-SenPlayer] 尝试使用带 -c 后缀...`);
                    fetch123AV(`https://123av.com/zh/v/${code}-c`, code, 1);
                } else if (redirectCount === 1) {
                    console.log(`[JavDB-SenPlayer] 尝试使用 123AV 搜索接口...`);
                    fetch123AV(`https://123av.com/zh/search?q=${code}`, code, 2);
                } else if (redirectCount === 2 && resp.status === 200) {
                    let videoLinkReg = new RegExp(`href="([^"]*\/v\/${code}[^"]*)"`, "i");
                    let linkMatch = dataStr.match(videoLinkReg);
                    if (linkMatch && linkMatch[1]) {
                        let nextUrl = linkMatch[1].startsWith('/') ? "https://123av.com" + linkMatch[1] : linkMatch[1];
                        console.log(`[JavDB-SenPlayer] 找到列表详情页: ${nextUrl}`);
                        fetch123AV(nextUrl, code, 3);
                    } else {
                        $done({ body });
                    }
                } else {
                    $done({ body });
                }
            }
        } else {
            console.log(`[JavDB-SenPlayer] ❌ 未知错误，状态码: ${resp.status}`);
            $done({ body });
        }
    });
}

// ==========================================
// 增强型 M3U8 提取函数 (兼容 123AV 各种刁钻路径)
// ==========================================
function findM3u8(data, domain) {
    if (!data) return null;
    
    // 1. 匹配绝对链接或协议相对链接 (如 //cdn.xyz/index.m3u8)
    let m3u8Reg = /(?:https?:)?\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i;
    let match = data.match(m3u8Reg);
    if (match) {
        let url = match[0];
        if (url.startsWith("//")) url = "https:" + url; // 补全 https:
        return url;
    }
    
    // 2. 匹配站内相对路径 (如 /videos/index.m3u8)
    let relReg = /["'](\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i;
    let relMatch = data.match(relReg);
    if (relMatch) {
        return domain + relMatch[1]; // 加上域名
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
function handleSuccess(code, m3u8, source) {
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