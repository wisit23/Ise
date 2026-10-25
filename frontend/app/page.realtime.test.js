import { act, render, screen, waitFor } from "@testing-library/react";
import { io } from "socket.io-client";
import HomePage from "./page";
import { apiFetch } from "../lib/api";

jest.mock("socket.io-client", () => ({ io: jest.fn() }));
jest.mock("../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../lib/catalog", () => ({ fetchActiveCategories: () => Promise.resolve([]) }));
jest.mock("../components/NavBar", () => function Nav() { return <nav />; });
jest.mock("../components/Footer", () => function Footer() { return <footer />; });
jest.mock("../components/home/useHomeEntrance", () => () => {});
jest.mock("../components/home/FannedHeroCards", () => function Hero() { return null; });
jest.mock("../components/ProductCard", () => function Card({ product }) { return <a href={`/products/${product.id}`}>{product.title}</a>; });

it("updates new arrivals, totals and recommendations after seller creates, hides, restores, edits and deletes", async () => {
  const listeners = new Set();
  io.mockReturnValue({
    on: (event, fn) => { if (event === "catalog:changed") listeners.add(fn); },
    off: (event, fn) => listeners.delete(fn),
    close: jest.fn(),
  });
  let products = [{ id: "p1", title: "เสื้อตัวแรก" }];
  apiFetch.mockImplementation(() => Promise.resolve({ items: [...products], total: products.length, fallbackReason: "guest" }));
  render(<HomePage />);
  await waitFor(() => expect(screen.getAllByText("เสื้อตัวแรก")).toHaveLength(2));
  expect(io).toHaveBeenCalledTimes(1);
  const changed = () => act(() => { listeners.forEach((fn) => fn()); });

  products = [...products, { id: "p2", title: "สินค้าใหม่" }];
  changed();
  await waitFor(() => expect(screen.getAllByText("สินค้าใหม่")).toHaveLength(2));
  expect(screen.getByText("ชิ้นพร้อมขาย")).toHaveTextContent("2");

  products = products.filter((p) => p.id !== "p2");
  changed();
  await waitFor(() => expect(screen.queryByText("สินค้าใหม่")).not.toBeInTheDocument());
  expect(screen.getByText("ชิ้นพร้อมขาย")).toHaveTextContent("1");

  products = [...products, { id: "p2", title: "กลับมาแสดง" }];
  changed();
  await waitFor(() => expect(screen.getAllByText("กลับมาแสดง")).toHaveLength(2));
  products = products.map((p) => p.id === "p2" ? { ...p, title: "ชื่อที่แก้ไข" } : p);
  changed();
  await waitFor(() => expect(screen.getAllByText("ชื่อที่แก้ไข")).toHaveLength(2));

  products = [];
  changed();
  await waitFor(() => expect(screen.queryByText("ชื่อที่แก้ไข")).not.toBeInTheDocument());
  expect(screen.queryByText("เสื้อตัวแรก")).not.toBeInTheDocument();
  expect(screen.getByText("ชิ้นพร้อมขาย")).toHaveTextContent("0");
});
