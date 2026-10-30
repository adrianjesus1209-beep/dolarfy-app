<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$action = isset($_GET['action']) ? $_GET['action'] : 'all';

if ($action === 'check') {
    echo json_encode([
        'proxy' => 'active',
        'timestamp' => round(microtime(true) * 1000)
    ]);
    exit;
}

function parseSpanishDateToIso($text) {
    if (!$text) return null;
    $months = [
        'enero' => '01', 'febrero' => '02', 'marzo' => '03', 'abril' => '04',
        'mayo' => '05', 'junio' => '06', 'julio' => '07', 'agosto' => '08',
        'septiembre' => '09', 'setiembre' => '09', 'octubre' => '10',
        'noviembre' => '11', 'diciembre' => '12'
    ];
    if (preg_match('/(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/iu', $text, $m)) {
        $day = str_pad($m[1], 2, '0', STR_PAD_LEFT);
        $monthKey = mb_strtolower($m[2], 'UTF-8');
        $month = isset($months[$monthKey]) ? $months[$monthKey] : '01';
        $year = $m[3];
        return "$year-$month-$day";
    }
    return null;
}

function isoToShortDate($iso) {
    if (!$iso) return '';
    $parts = explode('-', substr($iso, 0, 10));
    if (count($parts) !== 3) return $iso;
    return $parts[2] . '/' . $parts[1] . '/' . $parts[0];
}

function fetchBcvDirect() {
    $ch = curl_init('https://www.bcv.org.ve/');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    ]);
    $html = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if (!$html || $httpCode !== 200) {
        return ['status' => 'fail'];
    }

    $usd = null;
    $eur = null;
    $isoDate = null;
    $fecha = 'Oficial BCV';

    if (preg_match('/id="dolar"[\s\S]{0,800}?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i', $html, $mUsd)) {
        $cleaned = str_replace(',', '.', str_replace('.', '', trim($mUsd[1])));
        $val = floatval($cleaned);
        if ($val > 0) $usd = round($val, 2);
    }

    if (preg_match('/id="euro"[\s\S]{0,800}?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i', $html, $mEur)) {
        $cleaned = str_replace(',', '.', str_replace('.', '', trim($mEur[1])));
        $val = floatval($cleaned);
        if ($val > 0) $eur = round($val, 2);
    }

    if (preg_match('/Fecha\s+Valor[\s\S]{0,500}?content="(\d{4}-\d{2}-\d{2})/i', $html, $mIso)) {
        $isoDate = $mIso[1];
    }

    if (preg_match('/Fecha\s+Valor[\s\S]{0,500}?<span[^>]*>([^<]+)<\/span>/i', $html, $mFecha)) {
        $fecha = preg_replace('/\s+/', ' ', trim($mFecha[1]));
        if (!$isoDate) {
            $isoDate = parseSpanishDateToIso($fecha);
        }
    }

    if (!$usd) {
        return ['status' => 'fail'];
    }

    return [
        'status' => 'ok',
        'usd' => $usd,
        'eur' => $eur,
        'isoDate' => $isoDate,
        'shortDate' => isoToShortDate($isoDate),
        'fecha' => $fecha
    ];
}

function fetchBinanceP2P() {
    $payload = json_encode([
        'fiat' => 'VES',
        'page' => 1,
        'rows' => 10,
        'tradeType' => 'BUY',
        'asset' => 'USDT',
        'countries' => [],
        'payTypes' => []
    ]);

    $ch = curl_init('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json'
        ],
        CURLOPT_ENCODING => '',
        CURLOPT_TIMEOUT => 4,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ]);
    $raw = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if (!$raw || $httpCode !== 200) {
        return ['status' => 'fail', 'prices' => []];
    }

    $json = json_decode($raw, true);
    if (!isset($json['data']) || !is_array($json['data']) || count($json['data']) === 0) {
        return ['status' => 'fail', 'prices' => []];
    }

    $prices = [];
    foreach ($json['data'] as $item) {
        $isPromoted = !empty($item['adv']['isPromoted']) || !empty($item['isPromoted']);
        if (!$isPromoted && isset($item['adv']['price'])) {
            $p = floatval($item['adv']['price']);
            if ($p > 0) $prices[] = $p;
        }
    }

    if (count($prices) === 0) {
        foreach ($json['data'] as $item) {
            if (isset($item['adv']['price'])) {
                $p = floatval($item['adv']['price']);
                if ($p > 0) $prices[] = $p;
            }
        }
    }

    sort($prices, SORT_NUMERIC);
    return [
        'status' => count($prices) > 0 ? 'ok' : 'fail',
        'prices' => $prices
    ];
}

echo json_encode([
    'bcv' => fetchBcvDirect(),
    'binance' => fetchBinanceP2P(),
    'timestamp' => round(microtime(true) * 1000)
]);
