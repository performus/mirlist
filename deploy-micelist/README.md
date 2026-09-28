# Заглушка micelist.ru — заливка на хостинг REG.RU

```
deploy-micelist/
  public/    → содержимое папки сайта micelist.ru
    index.html, img/, send.php, consent.html, privacy.html, .htaccess
  private/   → micelist-mail.php (пароль ящика; в git не попадает)
  keys.txt   → доступы (в git не попадает)
```

`public/` — копия `stub/` без образца настроек. После правок заглушки обновить:

```sh
cp -r stub/index.html stub/img stub/send.php stub/consent.html stub/privacy.html deploy-micelist/public/
```

## Где что лежит на сервере

```
/var/www/uXXXXXXX/data/www/
  micelist-mail.php      ← из private/, УРОВНЕМ ВЫШЕ папки сайта
  micelist-data/         ← создаётся само: leads.csv и счётчик частоты
  micelist.ru/           ← папка сайта, сюда всё из public/
    index.html  img/  send.php  consent.html  privacy.html  .htaccess
```

`send.php` ищет настройки в `../micelist-mail.php`. Из браузера этот файл недоступен:
он лежит вне папки сайта.

## Заливка через файловый менеджер REG.RU

1. Войти в личный кабинет REG.RU → «Хостинг» → услуга с micelist.ru →
   «Войти в панель управления» (ISPmanager).
2. В панели: «Сайты» → micelist.ru → проверить версию PHP: 8.1 или новее.
3. «Менеджер файлов» → открыть `www/micelist.ru`. Удалить заглушку хостинга
   (`index.html` / `index.php` по умолчанию, если есть).
4. Загрузить туда всё из `public/`: кнопка «Закачать», выбрать файлы.
   Папку `img` создать кнопкой «Создать» → «Каталог» и загрузить в неё картинки.
   `.htaccess` скрытый: в проводнике Windows включить «Показывать скрытые элементы».
5. Подняться на уровень выше, в `www/`, и загрузить туда `private/micelist-mail.php`.
   Не в `micelist.ru`!
6. Открыть `micelist-mail.php` в панели («Изменить») и проверить: `pass` — пароль ящика,
   `to` — куда слать заявки.

## Почтовый ящик

Панель → «Почта» → «Почтовые ящики» → создать `noreply@micelist.ru`, задать пароль,
вписать его в `micelist-mail.php`. SMTP: `mail.hosting.reg.ru`, порт 465, SSL.

## HTTPS

Личный кабинет REG.RU → домен micelist.ru → «SSL-сертификаты» → заказать бесплатный
(Let's Encrypt / «Бесплатный SSL») и установить на сайт. Выпуск — до нескольких часов.
Перенаправление с http на https делает `.htaccess`. Если после этого сайт уходит
в бесконечный редирект — удалить из `.htaccess` блок `RewriteEngine … RewriteRule`
и включить в панели: «Сайты» → micelist.ru → «Перенаправлять HTTP-запросы в HTTPS».

## Проверка после заливки

1. `http://micelist.ru` перебрасывает на `https://micelist.ru`, замок в адресной строке.
2. `https://micelist.ru/send.php` в браузере отвечает `{"ok":false,"error":"method"}` —
   PHP работает. Ответ `{"ok":false,"error":"config"}` на отправке заявки значит,
   что `micelist-mail.php` не найден уровнем выше.
3. `https://micelist.ru/micelist-mail.php` и `https://micelist.ru/../micelist-mail.php` —
   404 или 403, не содержимое файла.
4. Без роли и без согласия форма не отправляется, сообщения под группами.
5. Тестовая заявка: письмо пришло на адрес из `to`, в `www/micelist-data/leads.csv`
   появилась строка.
