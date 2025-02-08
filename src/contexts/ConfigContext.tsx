import React, { createContext, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Config } from "../config";

interface ConfigContextType {
  config: Config | null;
  loading: boolean;
  error: Error | null;
  reloadConfig: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | null>(null);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const newConfig = await invoke<Config>("get_config");
      console.log("[ConfigContext] Loaded config:", newConfig);
      setConfig(newConfig);
      setError(null);
    } catch (err) {
      console.error("[ConfigContext] Failed to load config:", err);
      setError(err instanceof Error ? err : new Error("Failed to load config"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  return (
    <ConfigContext.Provider
      value={{ config, loading, error, reloadConfig: loadConfig }}
    >
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
};
