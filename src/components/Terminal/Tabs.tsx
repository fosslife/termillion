import React, { createContext, useContext, useState } from "react";

type Tab = {
  id: string;
  label: string;
};

type TabsContextType = {
  activeTab: string;
  setActiveTab: (id: string) => void;
};

const TabsContext = createContext<TabsContextType | null>(null);

type TabsProps = {
  children: React.ReactNode;
  defaultTab?: string;
};

type TabListProps = {
  tabs: Tab[];
};

type TabProps = {
  id: string;
  children: React.ReactNode;
};

function Tab({ id, children }: TabProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tab must be used within Tabs");
  const { activeTab } = context;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        visibility: activeTab === id ? "visible" : "hidden",
        zIndex: activeTab === id ? 1 : 0,
      }}
    >
      {children}
    </div>
  );
}

function Tabs({ children, defaultTab }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || "");

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ tabs }: TabListProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("TabsList must be used within Tabs");
  const { activeTab, setActiveTab } = context;

  return (
    <div style={{ display: "flex", borderBottom: "1px solid #333" }}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          style={{
            padding: "8px 16px",
            cursor: "pointer",
            backgroundColor: activeTab === tab.id ? "#333" : "transparent",
            color: activeTab === tab.id ? "#fff" : "#999",
            borderTopLeftRadius: "4px",
            borderTopRightRadius: "4px",
            marginRight: "2px",
            userSelect: "none",
          }}
        >
          {tab.label}
        </div>
      ))}
    </div>
  );
}

export { Tabs, TabsList, Tab };
