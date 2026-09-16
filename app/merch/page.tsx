"use client";

import { Press_Start_2P } from "next/font/google";
import { useRouter } from "next/navigation";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
});

export default function Merch() {
  const router = useRouter();

  return (
    <main
      className={pixelFont.className}
      style={{
        backgroundImage: "url('/topshelf.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: "24px",
        padding: "20px",
        boxSizing: "border-box",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          color: "#fff",
          fontSize: "clamp(18px, 6vw, 32px)",
          textShadow: "3px 3px 0 rgba(0,0,0,0.6)",
          margin: 0,
        }}
      >
        COMING SOON
      </h1>

      <button
        onClick={() => router.push("/")}
        style={{
          fontFamily: "inherit",
          fontSize: "clamp(11px, 3vw, 14px)",
          padding: "14px 20px",
          background: "#000",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      >
        BACK
      </button>
    </main>
  );
}