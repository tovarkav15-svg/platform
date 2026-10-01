// Сайт собирается в статичные файлы для GitHub Pages: tovarkav15-svg.github.io/platform
const basePath = process.env.NODE_ENV === "production" ? "/platform" : "";

/** @type {import('next').NextConfig} */
export default {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};
