<?php
/**
 * Dolarfy - Backend Proxy para entornos XAMPP / Apache / PHP
 * Permite consultar Binance P2P y BCV directamente sin restricciones de CORS en el navegador.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($requestMethod === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

$action = isset($_GET['action']) ? trim($_GET['action']) : 'check';
$cacheDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'dolarfy_cache';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0777, true);
}

function getCachedData($key, $ttlSeconds) {
    global $cacheDir;
    $file = $cacheDir . DIRECTORY_SEPARATOR . 'df_' . md5($key) . '.json';
    if (file_exists($file) && (time() - filemtime($file)) < $ttlSeconds) {
        $content = @file_get_contents($file);
        if ($content) {
            $data = json_decode($content, true);
            if ($data) return $data;
        }
    }
    return null;
}

function setCachedData($key, $data) {
    global $cacheDir;
    $file = $cacheDir . DIRECTORY_SEPARATOR . 'df_' . md5($key) . '.json';
    @file_put_contents($file, json_encode($data));
}

function fetchBinanceP2P() {
    $cached = getCachedData('binance_p2p_ves', 30); // 30s TTL
    if ($cached) {
        $cached['_cached'] = true;
        return $cached;
    }

    $url = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
    $payload = json_encode([
        'fiat' => 'VES',
        'page' => 1,
        'rows' => 10,
        'tradeType' => 'BUY',
        'asset' => 'USDT',
        'countries' => [],
        'payTypes' => []
    ]);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Accept: application/json',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 4);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200 && $response) {
        $data = json_decode($response, true);
        if ($data && !empty($data['data'])) {
            $prices = [];
            foreach ($data['data'] as $item) {
                if (!empty($item['adv']['price'])) {
                    $p = floatval($item['adv']['price']);
                    if ($p > 0) $prices[] = $p;
                }
            }
            sort($prices);
            $result = [
                'status' => 'ok',
                'prices' => $prices,
                'count' => count($prices),
                'timestamp' => time()
            ];
            setCachedData('binance_p2p_ves', $result);
            return $result;
        }
    }

    return ['status' => 'fail', 'prices' => []];
}

function fetchBcvOfficial() {
    $cached = getCachedData('bcv_official_rates', 300); // 5 min TTL
    if ($cached) {
        $cached['_cached'] = true;
        return $cached;
    }

    $ch = curl_init('https://www.bcv.org.ve');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 4);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

    $html = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200 && $html) {
        $usd = null;
        $eur = null;
        $fecha = null;

        if (preg_match('/id=["\']dolar["\'][\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i', $html, $m)) {
            $usd = floatval(str_replace(',', '.', str_replace('.', '', trim($m[1]))));
        }
        if (preg_match('/id=["\']euro["\'][\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i', $html, $m)) {
            $eur = floatval(str_replace(',', '.', str_replace('.', '', trim($m[1]))));
        }
        if (preg_match('/(?:Fecha\s+Valor|dinamic-date)[\s\S]*?<span[^>]*>\s*([^<]+)\s*<\/span>/i', $html, $m)) {
            $fecha = trim(preg_replace('/\s+/', ' ', $m[1]));
        }

        if ($usd && $usd > 0) {
            $result = [
                'status' => 'ok',
                'usd' => $usd,
                'eur' => $eur,
                'fecha' => $fecha,
                'timestamp' => time()
            ];
            setCachedData('bcv_official_rates', $result);
            return $result;
        }
    }

    return ['status' => 'fail', 'usd' => null, 'eur' => null, 'fecha' => null];
}

switch ($action) {
    case 'check':
        echo json_encode([
            'status' => 'ok',
            'proxy' => 'active',
            'server' => 'PHP/' . phpversion(),
            'time' => date('c')
        ]);
        break;

    case 'binance':
        echo json_encode(fetchBinanceP2P());
        break;

    case 'bcv':
        echo json_encode(fetchBcvOfficial());
        break;

    case 'all':
        $bcv = fetchBcvOfficial();
        $binance = fetchBinanceP2P();
        echo json_encode([
            'status' => 'ok',
            'bcv' => $bcv,
            'binance' => $binance,
            'timestamp' => time()
        ]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Acción desconocida']);
        break;
}
