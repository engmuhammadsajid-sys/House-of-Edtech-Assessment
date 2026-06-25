import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-foreground/10 px-6 py-4 text-center text-sm text-foreground/60">
      <p>
        <span className="font-medium text-foreground">Khurram Shahzad</span>
        {" · "}
        <Link
          href="https://github.com/khurram-dev-001/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          GitHub
        </Link>
        {" · "}
        <Link
          href="https://www.linkedin.com/in/khurram-shahzad-a5066110a/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          LinkedIn
        </Link>
      </p>
    </footer>
  );
}
