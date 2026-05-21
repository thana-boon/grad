-- GradTrack settings table
-- รัน SQL นี้ใน phpMyAdmin ใน database: gradtrack

CREATE TABLE IF NOT EXISTS `settings` (
  `key`       VARCHAR(100) NOT NULL,
  `value`     TEXT,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
