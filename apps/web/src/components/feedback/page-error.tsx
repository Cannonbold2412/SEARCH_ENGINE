import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type PageErrorProps = {
  message: string;
  className?: string;
  backHref?: string;
  backLabel?: string;
};

export function PageError({ message, className, backHref, backLabel }: PageErrorProps) {
  return (
    <div
      className={
        className ?? "min-h-[60vh] flex items-center justify-center"
      }
    >
      <div className="text-center max-w-md space-y-3">
        <p className="text-destructive">{message}</p>
        {backHref != null && (
          <Link
            href={backHref}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 group"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {backLabel ?? "Back"}
          </Link>
        )}
      </div>
    </div>
  );
}
