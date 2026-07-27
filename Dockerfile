# syntax=docker/dockerfile:1

# ===== base =====
FROM node:20-alpine AS base
WORKDIR /app
ENV TZ=Asia/Bangkok

# ===== build client =====
# base path ถูก bake ลงใน asset URL ทุกตัวตอน `vite build` → ต้องรู้ค่าตั้งแต่ตอน build
# ไม่ใช่ตอน runtime  (compose ส่ง BASE_PATH=/gradtrack มาให้ ดู docker-compose.yml)
FROM base AS client
ARG BASE_PATH=
ENV BASE_PATH=$BASE_PATH
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ===== server deps (production only) =====
FROM base AS server-deps
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ===== runtime =====
FROM base AS runner
ENV NODE_ENV=production
# ARG เป็นของแต่ละ stage — ต้องประกาศใหม่ที่นี่
# runtime ต้องได้ BASE_PATH ค่าเดียวกับตอน build ไม่งั้น express mount คนละ prefix
# กับที่ asset ถูก bake ไว้ → หน้าขึ้นแต่ JS/CSS 404 ทั้งหมด
ARG BASE_PATH=
ENV BASE_PATH=$BASE_PATH
ENV PORT=3003

WORKDIR /app/server
COPY --from=server-deps /app/node_modules ./node_modules
COPY server/ ./
# client ที่ build แล้ว — express เสิร์ฟจาก ../client/dist (ดู server/index.js)
COPY --from=client /app/dist /app/client/dist

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# ไม่รันเป็น root — user "node" มากับ base image อยู่แล้ว
# uploads/ กับ logs/ ต้องเขียนได้ และต้องมีอยู่ใน image ก่อน mount volume
# (named volume ที่ mount ครั้งแรกจะ copy ownership จากโฟลเดอร์ใน image)
RUN mkdir -p /app/server/uploads /app/server/logs \
 && chown -R node:node /app/server/uploads /app/server/logs
USER node

EXPOSE 3003

# ไม่มี HEALTHCHECK ใน image — กำหนดใน compose แทน เพราะ path ขึ้นกับ BASE_PATH
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "index.js"]
