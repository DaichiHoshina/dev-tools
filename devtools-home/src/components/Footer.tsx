export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer class="app-footer mt-auto">
      <div class="max-w-6xl mx-auto px-5 py-5">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-secondary">
          <span>&copy; {currentYear} Your Team</span>
          <div class="flex items-center gap-3">
            <span>DevTools v1.0.0</span>
            <span class="text-base-300">|</span>
            <a
              href="https://gitlab.example.com/your-org/devtools/-/issues"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-primary transition-colors"
            >
              バグ報告
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
