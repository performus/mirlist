<?php
/**
 * МАЙСЛИСТ — приём заявок с заглушки micelist.ru.
 *
 * Принимает POST с JSON {email, roles[], consent, company}, проверяет,
 * пишет заявку в CSV вне публичной папки и отправляет письмо на почту.
 *
 * Настройки — в файле micelist-mail.php уровнем выше папки сайта,
 * чтобы пароль не лежал в публичной директории и не попал в git.
 * Образец настроек: micelist-mail.example.php.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function reply(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    reply(405, ['ok' => false, 'error' => 'method']);
}

/* ── настройки ── */
$cfg = null;
foreach ([dirname(__DIR__) . '/micelist-mail.php', __DIR__ . '/micelist-mail.php'] as $path) {
    if (is_file($path)) { $cfg = require $path; break; }
}
if (!is_array($cfg) || empty($cfg['to']) || empty($cfg['from'])) {
    error_log('micelist send.php: нет файла настроек micelist-mail.php или в нём не заданы to/from');
    reply(500, ['ok' => false, 'error' => 'config']);
}
$dataDir = rtrim($cfg['data_dir'] ?? dirname(__DIR__) . '/micelist-data', '/');

/* ── входные данные ── */
$raw = (string) file_get_contents('php://input', false, null, 0, 10000);
$in = json_decode($raw, true);
if (!is_array($in)) { $in = $_POST; }

// Скрытое поле-ловушка: человек его не видит и не заполняет, бот заполняет.
// Боту отвечаем «успехом», чтобы он не подбирал обход.
if (trim((string) ($in['company'] ?? '')) !== '') {
    reply(200, ['ok' => true]);
}

$email = trim((string) ($in['email'] ?? ''));
if ($email === '' || strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    reply(422, ['ok' => false, 'error' => 'email']);
}

$ROLES = [
    'organizer' => 'Организую мероприятия',
    'venue'     => 'Представляю площадку (зал, отель, конгресс-центр)',
    'supplier'  => 'Предоставляю услуги',
];
$roles = array_values(array_unique(array_filter(
    (array) ($in['roles'] ?? []),
    fn($r) => is_string($r) && isset($ROLES[$r])
)));
if (!$roles) {
    reply(422, ['ok' => false, 'error' => 'roles']);
}

if (($in['consent'] ?? false) !== true) {
    reply(422, ['ok' => false, 'error' => 'consent']);
}

/* ── ограничение частоты: не больше 5 заявок с одного адреса за 10 минут ── */
$ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . ($cfg['salt'] ?? 'micelist'));
if (is_dir($dataDir) || @mkdir($dataDir, 0750, true)) {
    $rlFile = $dataDir . '/ratelimit.json';
    $fh = @fopen($rlFile, 'c+');
    if ($fh && flock($fh, LOCK_EX)) {
        $now = time();
        $map = json_decode((string) stream_get_contents($fh), true) ?: [];
        foreach ($map as $k => $list) {
            $map[$k] = array_values(array_filter((array) $list, fn($t) => $t > $now - 600));
            if (!$map[$k]) unset($map[$k]);
        }
        if (count($map[$ipHash] ?? []) >= 5) {
            flock($fh, LOCK_UN); fclose($fh);
            reply(429, ['ok' => false, 'error' => 'rate']);
        }
        $map[$ipHash][] = $now;
        ftruncate($fh, 0); rewind($fh);
        fwrite($fh, json_encode($map));
        flock($fh, LOCK_UN); fclose($fh);
    }
}

/* ── запись в список: из него потом рассылается письмо о запуске ── */
$date = (new DateTimeImmutable('now', new DateTimeZone('Europe/Moscow')))->format('Y-m-d H:i:s');
$roleNames = array_map(fn($r) => $ROLES[$r], $roles);
$csvSafe = fn(string $s) => preg_match('/^[=+\-@\t\r]/', $s) ? "'" . $s : $s;  // защита от формул в Excel

$saved = false;
if (is_dir($dataDir)) {
    $csv = $dataDir . '/leads.csv';
    $isNew = !is_file($csv);
    $fh = @fopen($csv, 'a');
    if ($fh && flock($fh, LOCK_EX)) {
        if ($isNew) {
            fwrite($fh, "\xEF\xBB\xBF");  // BOM, чтобы Excel открыл кириллицу
            fputcsv($fh, ['Дата (МСК)', 'Email', 'Роли', 'Согласие на обработку ПДн', 'Версия текста согласия', 'Источник'], ';');
        }
        $saved = fputcsv($fh, [$date, $csvSafe($email), implode(', ', $roleNames), 'да', (string) ($cfg['consent_version'] ?? ''), 'заглушка micelist.ru'], ';') !== false;
        flock($fh, LOCK_UN); fclose($fh);
    } else {
        error_log('micelist send.php: не удалось записать ' . $csv);
    }
}

/* ── письмо ── */
$enc = fn(string $s) => '=?UTF-8?B?' . base64_encode($s) . '?=';
$to = array_values(array_filter(array_map('trim', explode(',', (string) $cfg['to']))));
$from = (string) $cfg['from'];
$subject = 'Заявка на ранний доступ — МАЙСЛИСТ';
$body = "Новая заявка на ранний доступ к бета-версии.\r\n\r\n"
      . "Email: {$email}\r\n"
      . "Кто: " . implode('; ', $roleNames) . "\r\n"
      . "Дата: {$date} (МСК)\r\n"
      . "Согласие на обработку персональных данных: получено\r\n\r\n"
      . "Ответить можно прямо на это письмо — оно уйдёт заявителю.\r\n";

$headers = [
    'Date: ' . date(DATE_RFC2822),
    'From: ' . $enc('МАЙСЛИСТ') . " <{$from}>",
    'To: ' . implode(', ', $to),
    "Reply-To: <{$email}>",
    'Subject: ' . $enc($subject),
    'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . substr(strrchr($from, '@'), 1) . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
];
$encodedBody = rtrim(chunk_split(base64_encode($body), 76, "\r\n"));

try {
    if (($cfg['transport'] ?? 'smtp') === 'smtp') {
        smtp_send($cfg['smtp'] ?? [], $from, $to, implode("\r\n", $headers) . "\r\n\r\n" . $encodedBody);
    } else {
        // Встроенная отправка хостинга: без пароля, но чаще попадает в спам.
        $h = array_filter($headers, fn($l) => !preg_match('/^(To|Subject):/', $l));
        if (!mail(implode(', ', $to), $enc($subject), $encodedBody, implode("\r\n", $h), '-f' . $from)) {
            throw new RuntimeException('mail() вернула false');
        }
    }
} catch (Throwable $e) {
    error_log('micelist send.php: письмо не отправлено: ' . $e->getMessage());
    // Если заявка записана в список, для человека она принята: показываем
    // успех, чтобы он не отправлял повторно и не плодил дубли.
    // Ошибка только в том случае, если заявку не удалось ни записать, ни отправить.
    if (!$saved) reply(502, ['ok' => false, 'error' => 'mail']);
}

reply(200, ['ok' => true]);


/**
 * Минимальный SMTP-клиент без сторонних библиотек.
 * secure: 'ssl' — порт 465, 'tls' — порт 587 со STARTTLS.
 */
function smtp_send(array $c, string $from, array $to, string $message): void
{
    $host = (string) ($c['host'] ?? '');
    $port = (int) ($c['port'] ?? 465);
    $secure = (string) ($c['secure'] ?? 'ssl');
    if ($host === '' || empty($c['user']) || !isset($c['pass'])) {
        throw new RuntimeException('не заданы host/user/pass для SMTP');
    }
    $ctx = stream_context_create(['ssl' => [
        'verify_peer' => $c['verify'] ?? true,
        'verify_peer_name' => $c['verify'] ?? true,
        'SNI_enabled' => true,
    ]]);
    $fp = @stream_socket_client(($secure === 'ssl' ? 'ssl://' : 'tcp://') . "{$host}:{$port}",
        $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) throw new RuntimeException("соединение: {$errstr} ({$errno})");
    stream_set_timeout($fp, 15);

    $read = function () use ($fp): string {
        $resp = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $resp .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') break;
        }
        return $resp;
    };
    $cmd = function (?string $line, array $ok) use ($fp, $read): string {
        if ($line !== null) fwrite($fp, $line . "\r\n");
        $resp = $read();
        if (!in_array((int) substr($resp, 0, 3), $ok, true)) {
            throw new RuntimeException('SMTP: ' . trim($resp ?: 'нет ответа'));
        }
        return $resp;
    };

    try {
        $cmd(null, [220]);
        $ehlo = 'EHLO ' . ($c['helo'] ?? 'micelist.ru');
        $cmd($ehlo, [250]);
        if ($secure === 'tls') {
            $cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('STARTTLS не удался');
            }
            $cmd($ehlo, [250]);
        }
        $cmd('AUTH LOGIN', [334]);
        $cmd(base64_encode((string) $c['user']), [334]);
        $cmd(base64_encode((string) $c['pass']), [235]);
        $cmd("MAIL FROM:<{$from}>", [250]);
        foreach ($to as $rcpt) $cmd("RCPT TO:<{$rcpt}>", [250, 251]);
        $cmd('DATA', [354]);
        $cmd(preg_replace('/^\./m', '..', $message) . "\r\n.", [250]);
        fwrite($fp, "QUIT\r\n");
    } finally {
        fclose($fp);
    }
}
