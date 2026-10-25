"use client";

/** Admin pages need body.admin for the admin stylesheet's root selector. */
import { useEffect } from "react";

export function BodyAdmin() {
  useEffect(() => {
    document.body.className = "admin";
    return () => {
      document.body.className = "";
    };
  }, []);
  return null;
}
