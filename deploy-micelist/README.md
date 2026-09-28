# Заглушка micelist.ru — заливка на хостинг REG.RU

Сейчас заглушка **статичная**: персональные данные не собираются, пока оператор не внесён
в реестр Роскомнадзора. Формы нет — бегущая строка «Скоро объявим запись на ранний доступ».
PHP и почта на хостинге не нужны.

```
deploy-micelist/
  public/    → содержимое папки сайта micelist.ru: index.html, logo.svg, favicon.svg, .htaccess
  later/     → send.php, consent.html, privacy.html — для возврата формы, на сервер пока не кладутся
  private/   → micelist-mail.php — понадобится вместе с формой (в git не попадает)
  keys.txt   → доступы (в git не попадает)
```

`public/index.html` — заглушка micelist-stub.html; `logo.svg` и `favicon.svg` — из `assets/` прототипа.

## Заливка через файловый менеджер REG.RU

1. Войти в личный кабинет REG.RU → «Хостинг» → услуга с micelist.ru →
   «Войти в панель управления» (ISPmanager).
2. «Менеджер файлов» → открыть `www/micelist.ru`. Удалить заглушку хостинга
   (`index.html` / `index.php` по умолчанию, если есть).
3. Загрузить туда все четыре файла из `public/`: кнопка «Закачать», выбрать файлы.
   `.htaccess` скрытый: в проводнике Windows включить «Показывать скрытые элементы».

## HTTPS

Только после того, как A-записи `@` и `www` смотрят на `31.31.198.23`:

1. ISPmanager → «SSL-сертификаты» → «Let's Encrypt» → сайт micelist.ru,
   имена `micelist.ru` и `www.micelist.ru`.
2. «Сайты» → micelist.ru → включить «Перенаправлять HTTP-запросы в HTTPS»
   и перенаправление с www на основной адрес.

В `.htaccess` перенаправлений нет намеренно: HTTPS на REG.RU принимает nginx
перед Apache, правило в `.htaccess` может зациклиться, а до выпуска сертификата
привело бы посетителя к ошибке безопасности.

Проверить сайт до смены DNS можно через IP:

```sh
curl -s --resolve micelist.ru:80:31.31.198.23 http://micelist.ru/ | head
```

## Проверка после заливки

1. `http://micelist.ru`, `http://www.micelist.ru` и `https://www.micelist.ru` перебрасывают
   на `https://micelist.ru`, замок в адресной строке.
2. Страница открывается, фон и картинки на месте, в консоли браузера нет ошибок.

## Когда включим приём заявок

Всё готово и проверено локально, лежит в `later/` и в истории git
(коммит «Заглушка: приём заявок через send.php…»):

- форма с обязательными ролью и согласием, поле-ловушка, `sendLead` → `/send.php` —
  перенести в `public/index.html` из этого коммита;
- `later/send.php`, `later/consent.html`, `later/privacy.html` — в папку сайта
  (тексты согласия и политики — от юриста);
- `private/micelist-mail.php` — **уровнем выше** папки сайта, `www/micelist-mail.php`,
  с паролем ящика `noreply@micelist.ru` (SMTP `mail.hosting.reg.ru:465`, SSL);
- заявки пишутся в `www/micelist-data/leads.csv`, копия уходит письмом.
