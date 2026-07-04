import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Balão CRM WhatsApp",
    template: "%s | Balão CRM WhatsApp",
  },
  description: "Plataforma CRM com WhatsApp Business para a Balão da Informática Castelo. Gerencie clientes, campanhas, atendimentos e vendas em um único lugar.",
  keywords: ["CRM", "WhatsApp", "Balão da Informática", "Castelo", "vendas", "campanhas"],
  authors: [{ name: "Balão da Informática Castelo" }],
  robots: "noindex, nofollow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
