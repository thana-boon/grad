const { createLogger, format, transports } = require('winston');
const path = require('path');

const logger = createLogger({
  level: 'http',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${extra}`;
    })
  ),
  transports: [
    // แสดงใน console ขณะ dev
    new transports.Console(),

    // เก็บ log ทั้งหมด
    new transports.File({
      filename: path.join(__dirname, '../logs/app.log'),
      maxsize: 5 * 1024 * 1024, // 5MB แล้ว rotate
      maxFiles: 5,
    }),

    // เก็บเฉพาะ error แยกออกมา
    new transports.File({
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

module.exports = logger;
