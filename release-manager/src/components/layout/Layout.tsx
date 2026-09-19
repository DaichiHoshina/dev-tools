import type { FC, PropsWithChildren } from "hono/jsx";

interface LayoutProps {
  title: string;
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({
  title,
  children,
}) => {
  return (
    <html lang="ja" data-theme="releasemanager">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} - Release Manager</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
        <link rel="stylesheet" href="/static/style.css" />
      </head>
      <body>
        <div class="min-h-screen flex flex-col app-shell">
          <main class="flex-1 px-6 py-8 md:px-12 md:py-10 max-w-6xl w-full mx-auto app-main animate-fade-in">
            {children}
          </main>
        </div>
        <script src="/static/client.js" type="module"></script>
      </body>
    </html>
  );
};
