let body = $response.body;

if (!body) {
    $done({});
}

// 1. 匹配标准番号 (加了安全判空防崩溃)
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body ? body.match(idReg) : null;

if (match && match[1]) {
    let code = match[1].toLowerCase();
    console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);
    
    // 把请求拆解为独立函数调用，彻底解决变量被系统回收的报错 Bug
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
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = data ? data.match(m3u8Reg) : null;
            if (m3u8Match) {
                foundM3u8 = true;
                handleSuccess(code, m3u8Match[0], "Jable");
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
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = data ? data.match(m3u8Reg) : null;
            if (m3u8Match) {
                foundM3u8 = true;
                handleSuccess(code, m3u8Match[0], "Jable");
            }
        }
        
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 均未找到，转去 123AV...`);
            fetch123AV(`https://123av.com/zh/v/${code}`, code, 0);
        }
    });
}

// ==========================================
// 独立函数 3：处理 123AV 请求
// ==========================================
function fetch123AV(url, code, redirectCount) {
    if (redirectCount > 3) {
        console.log(`[JavDB-SenPlayer] ❌ 123AV 重试次数过多，已停止请求`);
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
            let location = resp.headers['Location'] || resp.headers['location'];
            if (location) {
                if (location.startsWith('/')) {
                    let domainMatch = url.match(/^https?:\/\/[^\/]+/);
                    let domain = domainMatch ? domainMatch[0] : "https://123av.com";
                    location = domain + location;
                }
                console.log(`[JavDB-SenPlayer] 🔄 自动跟随重定向至: ${location}`);
                fetch123AV(location, code, redirectCount + 1);
            } else {
                $done({ body });
            }
            return;
        }
        
        if (resp.status === 200 || resp.status === 404) {
            let unescapedData = (data && resp.status === 200) ? data.replace(/\\/g, "") : "";
            
            // 兼容 123AV 的相对路径提取
            let m3u8Reg = /(?:https?:)?\/\/[^"'\s<>]+\.m3u8|\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = unescapedData.match(m3u8Reg);

            if (m3u8Match && resp.status === 200) {
                let finalUrl = m3u8Match[0];
                if (finalUrl.startsWith("//")) finalUrl = "https:" + finalUrl;
                if (finalUrl.startsWith("/")) finalUrl = "https://123av.com" + finalUrl;
                
                handleSuccess(code, finalUrl, "123AV");
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ 123AV 当前链接(${resp.status})未找到m3u8。`);
                
                if (redirectCount === 0) {
                    console.log(`[JavDB-SenPlayer] 尝试使用搜索接口...`);
                    fetch123AV(`https://123av.com/zh/search?q=${code}`, code, 1);
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
// 伪装请求头（完全保留原样）
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
// 提取成功后的处理函数（完全保留原样）
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