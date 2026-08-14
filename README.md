# MerelyDiscordBot

Відкритий Discord-бот на Node.js, TypeScript, discord.js та MariaDB.

## Можливості

- Discord Gateway worker з командами `/ping` та `/motivation`.
- Команди для окремого guild у development або глобальні для production.
- `/motivation` (`/мотивація`) надсилає випадкову мотиваційну цитату згаданому користувачу
  (локальний `src/data/quotes.json`, 500+ українських цитат про роботу та цілі).
- Механізм правил відповідей на повідомлення через `src/data/rules.json`: патерн
  (regex або простий текст, без урахування регістру) → відповідь, з опційними посиланнями
  на канали залежно від доступу (плейсхолдер `{key}` + мапа `channels`).
- Стан роботи у MariaDB.
- Коректне завершення роботи та heartbeat-перевірка здоров'я у Docker.

## Файли з даними користувача

`src/data/quotes.json` (цитати для `/мотивація`) та `src/data/rules.json` (правила відповідей
на повідомлення) — звичайні JSON-файли, які можна редагувати вручну. Повний посібник користувача:
[`docs/USER_DATA_GUIDE.md`](docs/USER_DATA_GUIDE.md).

## Розробка

Потрібен Node.js 22.12 або новіший.

```bash
npm ci
npm run lint
npm test
npm run build
```

Конфігурація оточення постачається з `merely-server-infra`; не комітити Discord- або
database-credentials.

Для читання вмісту повідомлень потрібен `Message Content Intent` у Discord Developer Portal.
Правило office greeting у `src/data/rules.json` посилається на голосовий канал, якщо автор може
його переглядати та приєднуватися, інакше — на публічний текстовий канал (див. мапу `channels`
цього правила).

## Ліцензія

[MIT](LICENSE)
