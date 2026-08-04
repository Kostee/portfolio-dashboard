import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Portfolio Dashboard",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

type PortfolioLayoutProps = {
  children: ReactNode;
};

export default function PortfolioLayout({
  children,
}: PortfolioLayoutProps) {
  return children;
}