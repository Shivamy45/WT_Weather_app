<?php
// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

header('Content-Type: application/json; charset=utf-8');

// Sessions
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Lightweight .env loader (optional): loads KEY=VALUE pairs from .env in project root
function load_env_if_present(): void {
    $envPath = __DIR__ . DIRECTORY_SEPARATOR . '.env';
    if (!is_readable($envPath)) { return; }
    $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) { return; }
    foreach ($lines as $line) {
        $t = trim($line);
        if ($t === '' || str_starts_with($t, '#')) { continue; }
        $eqPos = strpos($t, '=');
        if ($eqPos === false) { continue; }
        $key = trim(substr($t, 0, $eqPos));
        $val = trim(substr($t, $eqPos + 1));
        if ($key === '') { continue; }
        // Strip optional surrounding quotes
        if ((str_starts_with($val, '"') && str_ends_with($val, '"')) || (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
            $val = substr($val, 1, -1);
        }
        putenv($key . '=' . $val);
        $_ENV[$key] = $val;
        $_SERVER[$key] = $val;
    }
}

// Load .env once
load_env_if_present();

// Shared config
$apiKey = getenv('OPENWEATHER_API_KEY') ?: '27095c840ec24e4a32ffb55ecafbf9b2';
$mode = isset($_GET['mode']) ? trim((string)$_GET['mode']) : (isset($_POST['mode']) ? trim((string)$_POST['mode']) : 'weather');

// DB config (adjust as needed for your XAMPP setup)
$dbHost = getenv('DB_HOST') ?: '127.0.0.1';
$dbName = getenv('DB_NAME') ?: 'weather_app';
$dbUser = getenv('DB_USER') ?: 'root';
$dbPass = getenv('DB_PASS') ?: '';

// Connect to DB
function get_pdo(): PDO {
    static $pdo = null;
    if ($pdo !== null) { return $pdo; }
    global $dbHost, $dbName, $dbUser, $dbPass;
    $dsn = "mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4";
    $pdo = new PDO($dsn, $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}

// Bootstrap schema if missing
function ensure_schema(): void {
    $pdo = get_pdo();
    // Create tables if not exist
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS searches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        city VARCHAR(100) NOT NULL,
        searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS favorites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        city VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS weather_cache (
        id INT AUTO_INCREMENT PRIMARY KEY,
        city VARCHAR(100) NOT NULL,
        data_json JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_city (city)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        city VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
}

try {
    ensure_schema();
} catch (Throwable $e) {
    // If DB is not configured yet, allow suggest and weather to still work (without DB-backed features)
}

// Build HTTP context
$context = stream_context_create([
    'http' => [
        'method' => 'GET',
        'timeout' => 8,
        'ignore_errors' => true,
        'header' => [
            'Accept: application/json',
            'User-Agent: SimpleWeatherApp/1.1'
        ]
    ]
]);

// Helpers
function json_ok($data) { echo json_encode($data, JSON_UNESCAPED_UNICODE); exit(); }
function require_pdo(): PDO {
    try { return get_pdo(); } catch (Throwable $e) { http_response_code(500); json_ok(['error' => 'Database unavailable']); }
}
function current_user_id(): ?int { return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null; }
function is_admin_email(string $email): bool {
    $admins = [getenv('ADMIN_EMAIL') ?: 'admin@example.com'];
    return in_array(strtolower($email), array_map('strtolower', $admins), true);
}

// AUTH: register
if ($mode === 'register') {
    $email = trim((string)($_POST['email'] ?? $_GET['email'] ?? ''));
    $password = (string)($_POST['password'] ?? $_GET['password'] ?? '');
    if ($email === '' || $password === '') { http_response_code(400); json_ok(['error' => 'email and password required']); }
    $pdo = require_pdo();
    try {
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare('INSERT INTO users (email, password_hash) VALUES (:email, :hash)');
        $stmt->execute([':email' => $email, ':hash' => $hash]);
        $userId = (int)$pdo->lastInsertId();
        $_SESSION['user_id'] = $userId;
        $_SESSION['email'] = $email;
        json_ok(['id' => $userId, 'email' => $email]);
    } catch (PDOException $e) {
        http_response_code(400);
        json_ok(['error' => 'Email already registered']);
    }
}

// AUTH: login
if ($mode === 'login') {
    $email = trim((string)($_POST['email'] ?? $_GET['email'] ?? ''));
    $password = (string)($_POST['password'] ?? $_GET['password'] ?? '');
    if ($email === '' || $password === '') { http_response_code(400); json_ok(['error' => 'email and password required']); }
    $pdo = require_pdo();
    $stmt = $pdo->prepare('SELECT id, email, password_hash FROM users WHERE email = :email');
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($password, $user['password_hash'])) { http_response_code(401); json_ok(['error' => 'Invalid credentials']); }
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['email'] = $user['email'];
    json_ok(['id' => (int)$user['id'], 'email' => $user['email']]);
}

// AUTH: logout
if ($mode === 'logout') {
    session_destroy();
    json_ok(['ok' => true]);
}

// AUTH: me
if ($mode === 'me') {
    $uid = current_user_id();
    if (!$uid) { json_ok(['user' => null]); }
    $email = isset($_SESSION['email']) ? (string)$_SESSION['email'] : '';
    json_ok(['user' => ['id' => $uid, 'email' => $email, 'isAdmin' => $email !== '' && is_admin_email($email)]]);
}

if ($mode === 'suggest') {
    // Suggestions mode (geocoding)
    $query = '';
    if (isset($_GET['query'])) {
        $query = trim((string)$_GET['query']);
    } elseif (isset($_POST['query'])) {
        $query = trim((string)$_POST['query']);
    }

    if ($query === '') {
        echo json_encode([]);
        exit();
    }

    $encodedQuery = urlencode($query);
    $geoUrl = "https://api.openweathermap.org/geo/1.0/direct?q={$encodedQuery}&limit=5&appid={$apiKey}";

    $geoResponse = @file_get_contents($geoUrl, false, $context);
    if ($geoResponse === false) {
        echo json_encode([]);
        exit();
    }
    $geoDecoded = json_decode($geoResponse, true);
    if (!is_array($geoDecoded)) {
        echo json_encode([]);
        exit();
    }

    $suggestions = [];
    foreach ($geoDecoded as $item) {
        if (!is_array($item)) { continue; }
        $name = isset($item['name']) ? (string)$item['name'] : '';
        $country = isset($item['country']) ? (string)$item['country'] : '';
        if ($name === '') { continue; }
        $suggestions[] = [ 'name' => $name, 'country' => $country ];
    }

    echo json_encode(array_slice($suggestions, 0, 5), JSON_UNESCAPED_UNICODE);
    exit();
}

// Favorites: add/list/delete
if ($mode === 'favorites') {
    $uid = current_user_id();
    if (!$uid) { http_response_code(401); json_ok(['error' => 'Unauthorized']); }
    $pdo = require_pdo();
    $action = trim((string)($_POST['action'] ?? $_GET['action'] ?? 'list'));
    if ($action === 'add') {
        $city = trim((string)($_POST['city'] ?? $_GET['city'] ?? ''));
        if ($city === '') { http_response_code(400); json_ok(['error' => 'city required']); }
        $stmt = $pdo->prepare('INSERT INTO favorites (user_id, city) VALUES (:uid, :city)');
        $stmt->execute([':uid' => $uid, ':city' => $city]);
        json_ok(['ok' => true]);
    } elseif ($action === 'delete') {
        $city = trim((string)($_POST['city'] ?? $_GET['city'] ?? ''));
        if ($city === '') { http_response_code(400); json_ok(['error' => 'city required']); }
        $stmt = $pdo->prepare('DELETE FROM favorites WHERE user_id = :uid AND city = :city');
        $stmt->execute([':uid' => $uid, ':city' => $city]);
        json_ok(['ok' => true]);
    } else { // list
        $stmt = $pdo->prepare('SELECT city FROM favorites WHERE user_id = :uid ORDER BY created_at DESC');
        $stmt->execute([':uid' => $uid]);
        $rows = $stmt->fetchAll();
        json_ok(array_map(fn($r) => $r['city'], $rows));
    }
}

// History: list recent searches for user
if ($mode === 'history') {
    $uid = current_user_id();
    if (!$uid) { json_ok([]); }
    $pdo = require_pdo();
    $stmt = $pdo->prepare('SELECT city, searched_at FROM searches WHERE user_id = :uid ORDER BY searched_at DESC LIMIT 20');
    $stmt->execute([':uid' => $uid]);
    json_ok($stmt->fetchAll());
}

// Trending today (top 10)
if ($mode === 'trending') {
    $pdo = require_pdo();
    $sql = 'SELECT city, COUNT(*) AS cnt FROM searches WHERE searched_at >= CURDATE() GROUP BY city ORDER BY cnt DESC, city ASC LIMIT 10';
    $rows = $pdo->query($sql)->fetchAll();
    json_ok($rows);
}

// Subscriptions: add/remove/list
if ($mode === 'subscriptions') {
    $uid = current_user_id();
    if (!$uid) { http_response_code(401); json_ok(['error' => 'Unauthorized']); }
    $pdo = require_pdo();
    $action = trim((string)($_POST['action'] ?? $_GET['action'] ?? 'list'));
    if ($action === 'add') {
        $city = trim((string)($_POST['city'] ?? $_GET['city'] ?? ''));
        if ($city === '') { http_response_code(400); json_ok(['error' => 'city required']); }
        $stmt = $pdo->prepare('INSERT INTO subscriptions (user_id, city) VALUES (:uid, :city)');
        $stmt->execute([':uid' => $uid, ':city' => $city]);
        json_ok(['ok' => true]);
    } elseif ($action === 'delete') {
        $city = trim((string)($_POST['city'] ?? $_GET['city'] ?? ''));
        if ($city === '') { http_response_code(400); json_ok(['error' => 'city required']); }
        $stmt = $pdo->prepare('DELETE FROM subscriptions WHERE user_id = :uid AND city = :city');
        $stmt->execute([':uid' => $uid, ':city' => $city]);
        json_ok(['ok' => true]);
    } else { // list
        $stmt = $pdo->prepare('SELECT city FROM subscriptions WHERE user_id = :uid ORDER BY created_at DESC');
        $stmt->execute([':uid' => $uid]);
        $rows = $stmt->fetchAll();
        json_ok(array_map(fn($r) => $r['city'], $rows));
    }
}

// Admin analytics
if ($mode === 'analytics') {
    $uid = current_user_id();
    $email = isset($_SESSION['email']) ? (string)$_SESSION['email'] : '';
    if (!$uid || !is_admin_email($email)) { http_response_code(403); json_ok(['error' => 'Forbidden']); }
    $pdo = require_pdo();

    // Top cities overall (last 7 days)
    $top = $pdo->query("SELECT city, COUNT(*) AS cnt FROM searches WHERE searched_at >= (NOW() - INTERVAL 7 DAY) GROUP BY city ORDER BY cnt DESC LIMIT 20")->fetchAll();

    // Searches per hour (last 24h)
    $perHour = $pdo->query("SELECT DATE_FORMAT(searched_at, '%Y-%m-%d %H:00:00') AS hour, COUNT(*) AS cnt FROM searches WHERE searched_at >= (NOW() - INTERVAL 24 HOUR) GROUP BY hour ORDER BY hour ASC")->fetchAll();

    // Avg temperature of searched cities today (join cache)
    $avgTemp = null;
    try {
        $row = $pdo->query("SELECT AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(w.data_json, '$.main.temp')) AS DECIMAL(10,2))) AS avg_temp FROM searches s JOIN weather_cache w ON LOWER(s.city) = LOWER(w.city) WHERE s.searched_at >= CURDATE()")->fetch();
        if ($row && $row['avg_temp'] !== null) { $avgTemp = (float)$row['avg_temp']; }
    } catch (Throwable $e) {
        $avgTemp = null; // JSON functions not available
    }

    json_ok(['topCities' => $top, 'perHour' => $perHour, 'avgTemp' => $avgTemp]);
}

// Default: weather mode (with caching, logging, and optional user linkage)
// Read city
$city = '';
if (isset($_GET['city'])) {
    $city = trim((string)$_GET['city']);
} elseif (isset($_POST['city'])) {
    $city = trim((string)$_POST['city']);
}

if ($city === '') {
    http_response_code(400);
    echo json_encode([ 'error' => 'Missing required parameter: city' ], JSON_UNESCAPED_UNICODE);
    exit();
}

$pdoAvailable = false;
try { get_pdo(); $pdoAvailable = true; } catch (Throwable $e) { $pdoAvailable = false; }

// Check cache
$cached = null;
if ($pdoAvailable) {
    try {
        $pdo = get_pdo();
        $stmt = $pdo->prepare('SELECT data_json, UNIX_TIMESTAMP(updated_at) AS ts FROM weather_cache WHERE city = :city');
        $stmt->execute([':city' => $city]);
        $row = $stmt->fetch();
        if ($row) {
            $age = time() - (int)$row['ts'];
            if ($age <= 15 * 60) { // 15 minutes
                $cached = json_decode($row['data_json'], true);
            }
        }
    } catch (Throwable $e) { /* ignore */ }
}

if ($cached === null) {
$encodedCity = urlencode($city);
$url = "https://api.openweathermap.org/data/2.5/weather?q={$encodedCity}&appid={$apiKey}&units=metric";
$apiResponse = @file_get_contents($url, false, $context);

if ($apiResponse === false) {
    http_response_code(502);
    echo json_encode([ 'error' => 'Failed to reach weather service' ], JSON_UNESCAPED_UNICODE);
    exit();
}

$decoded = json_decode($apiResponse, true);

if (!is_array($decoded)) {
    http_response_code(502);
    echo json_encode([ 'error' => 'Invalid response from weather service' ], JSON_UNESCAPED_UNICODE);
    exit();
}

if (isset($decoded['cod']) && (string)$decoded['cod'] !== '200') {
    $msg = isset($decoded['message']) ? $decoded['message'] : 'Weather service error';
    http_response_code(400);
    echo json_encode([ 'error' => $msg ], JSON_UNESCAPED_UNICODE);
    exit();
}

    $cached = $decoded;

    if ($pdoAvailable) {
        try {
            $pdo = get_pdo();
            $stmt = $pdo->prepare('INSERT INTO weather_cache (city, data_json) VALUES (:city, :json)
                ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), updated_at = CURRENT_TIMESTAMP');
            $stmt->execute([':city' => $city, ':json' => json_encode($decoded, JSON_UNESCAPED_UNICODE)]);
        } catch (Throwable $e) { /* ignore */ }
    }
}

// Log search
if ($pdoAvailable) {
    try {
        $pdo = get_pdo();
        $uid = current_user_id();
        $stmt = $pdo->prepare('INSERT INTO searches (user_id, city) VALUES (:uid, :city)');
        $stmt->execute([':uid' => $uid, ':city' => $city]);
    } catch (Throwable $e) { /* ignore */ }
}

$cityName = isset($cached['name']) ? $cached['name'] : $city;
$temp = isset($cached['main']['temp']) ? $cached['main']['temp'] : null;
$description = isset($cached['weather'][0]['description']) ? $cached['weather'][0]['description'] : '';
$icon = isset($cached['weather'][0]['icon']) ? $cached['weather'][0]['icon'] : '';

echo json_encode([
    'city' => $cityName,
    'temperature' => $temp,
    'description' => $description,
    'icon' => $icon,
], JSON_UNESCAPED_UNICODE);


