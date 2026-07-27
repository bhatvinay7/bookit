"use client";

import { Provider } from "react-redux";
import { store } from "../store";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SocketProvider } from "./SocketProvider";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ThemeProvider attribute="data-dark" defaultTheme="dark" value={{ light: "false", dark: "true" }}>
      <QueryClientProvider client={queryClient}>
        <SocketProvider>
          <Provider store={store}>{children}</Provider>
        </SocketProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
