"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Press_Start_2P } from "next/font/google";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
});

export default function Home() {
  const [menu, setMenu] = useState("main");
  const [selected, setSelected] = useState(0);

  const menus = {
    main: ["Music", "Socials", "Twitch", "Releases"],
    music: ["SoundCloud", "Spotify", "Apple Music", "Back"],
    socials: ["Instagram", "Back"],
    releases: ["TOPSHELF", "Back"],
  };


  const items = menus[menu as keyof typeof menus];

  const goUp = () => {
    setSelected((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const goDown = () => {
    setSelected((prev) => (prev + 1) % items.length);
  };

  const goBack = () => {
    setMenu("main");
    setSelected(0);
  };

  const selectItem = () => {
    const item = items[selected];

    if (menu === "main") {
      if (item === "Music") {
        setMenu("music");
        setSelected(0);
      }

      if (item === "Socials") {
        setMenu("socials");
        setSelected(0);
      }

      if (item === "Releases") {
        setMenu("releases");
        setSelected(0);
      }

      if (item === "Twitch") {
        window.open("https://www.twitch.tv/pinkmanee", "_blank");
      }
    }

    if (menu === "music") {
      if (item === "Spotify") {
        window.open(
          "https://open.spotify.com/artist/1fH0OQSGa851zXYDKeWvnb?si=Q4FugsHUSbup63vp4j0XEA",
          "_blank"
        );
      }

      if (item === "SoundCloud") {
        window.open("https://soundcloud.com/pinkmanee", "_blank");
      }

      if (item === "Apple Music") {
        window.open(
          "https://music.apple.com/us/artist/pinkmane/1879203655",
          "_blank"
        );
      }

      if (item === "Back") {
        goBack();
      }
    }

    if (menu === "socials") {
      if (item === "Instagram") {
        window.open("https://www.instagram.com/pinkmanee/", "_blank");
      }

      if (item === "Back") {
        goBack();
      }
    }

    if (menu === "releases") {
      if (item === "Back") {
        goBack();
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") goUp();
      if (e.key === "ArrowDown") goDown();
      if (e.key === "Enter") selectItem();
      if (e.key === "Backspace") goBack();
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY > 0) goDown();
      if (e.deltaY < 0) goUp();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  });

  return (
    <main
      style={{
        backgroundImage: "url('/topshelf.png')",
        backgroundSize: "cover",
        backgroundPosition: "contain",
        backgroundRepeat: "no-repeat",
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          background: "#cfcfcf",
          width: "540px",
          borderRadius: "40px",
          padding: "40px",
        }}
      >
        <div
          className={pixelFont.className}
          style={{
           background:
  menu === "releases"
    ? "#ffffff"
    : "#d7efbc",

            height: "420px",
            borderRadius: "8px",
            padding: "20px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              margin: "-20px -20px 20px -20px",
              backgroundImage: "url('/banner.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderTopLeftRadius: "8px",
              borderTopRightRadius: "8px",
              padding: "20px 0",
            }}
          >
            <h2
              style={{
                textAlign: "center",
                margin: 0,
                fontSize: "18px",
                color: "#fff",
                textShadow: "2px 2px 0 rgba(0,0,0,0.6)",
              }}
            >
              {menu === "main" ? "PINKMANE" : menu.toUpperCase()}
            </h2>
          </div>

          {menu === "releases" && selected === 0 ? (
            <div
              onClick={() =>
                window.open(
                  "https://soundcloud.com/pinkmanee/top-shelf",
                  "_blank"
                )
              }
              style={{
                position: "relative",
                width: "330px",
                height: "330px",
                margin: "0 auto",
                cursor: "pointer",
              }}
            >
              <Image
                src="/topshelf.png"
                alt="TOPSHELF"
                fill
                style={{
                  objectFit: "cover",
                  borderRadius: "8px",
                }}
              />
            </div>
          ) : (
            items.map((item, index) => (
              <div
                key={item}
                style={{
                  padding: "10px",
                  marginBottom: "8px",
                  fontSize: "14px",
                  lineHeight: "1.6",
                  background: selected === index ? "black" : "transparent",
                  color: selected === index ? "white" : "black",
                }}
              >
                {selected === index ? "> " : ""}
                {item}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            marginTop: "25px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "220px",
              height: "220px",
              borderRadius: "50%",
              background: "#efefef",
              border: "8px solid gray",
              position: "relative",
            }}
          >
            <button
              onClick={goBack}
              style={{
                position: "absolute",
                top: "18px",
                left: "50%",
                transform: "translateX(-50%)",
                border: "none",
                background: "transparent",
                fontWeight: "bold",
                fontSize: "16px",
                color: "#333",
                cursor: "pointer",
              }}
            >
              MENU
            </button>

            <button
              onClick={goUp}
              style={{
                position: "absolute",
                left: "22px",
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                fontSize: "30px",
                color: "#333",
                cursor: "pointer",
              }}
            >
              ◀
            </button>

            <button
              onClick={goDown}
              style={{
                position: "absolute",
                right: "22px",
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                fontSize: "30px",
                color: "#333",
                cursor: "pointer",
              }}
            >
              ▶
            </button>

            <button
              onClick={goDown}
              style={{
                position: "absolute",
                bottom: "15px",
                left: "50%",
                transform: "translateX(-50%)",
                border: "none",
                background: "transparent",
                fontSize: "28px",
                color: "#333",
                cursor: "pointer",
              }}
            >
               ⏯
            </button>

            <button
              onClick={selectItem}
              style={{
                width: "90px",
                height: "90px",
                borderRadius: "50%",
                border: "none",
                background: "#d8d8d8",
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}