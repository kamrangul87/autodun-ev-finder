export const metadata = {
  title: "Autodun EV Finder",
  description: "EV charging map",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
