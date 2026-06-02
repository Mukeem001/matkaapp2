import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Store, 
  Trophy, 
  History,
  PercentDiamond, 
  Users, 
  Ticket, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  Bell, 
  Settings,
  LogOut,
  Menu,
  ScrollText
} from "lucide-react";
import { 
  SidebarProvider, 
  Sidebar, 
  SidebarContent, 
  SidebarGroup, 
  SidebarGroupContent, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Markets", href: "/markets", icon: Store },
  { name: "Markets 2", href: "/markets2", icon: Store },
  { name: "Results", href: "/results", icon: Trophy },
  { name: "Result History", href: "/market-result-history", icon: History },
  { name: "Game Rates", href: "/game-rates", icon: PercentDiamond },
  { name: "Users", href: "/users", icon: Users },
  { name: "Bids", href: "/bids", icon: Ticket },
  { name: "Deposits", href: "/deposits", icon: ArrowDownToLine },
  { name: "Withdrawals", href: "/withdrawals", icon: ArrowUpFromLine },
  { name: "Notices", href: "/notices", icon: Bell },
  { name: "Scraper Logs", href: "/logs", icon: ScrollText },
  { name: "Settings", href: "/settings", icon: Settings },
];

function AppSidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <Sidebar className="border-r border-border/50 bg-sidebar">
      <SidebarContent>
        <div className="p-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/20">
              <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-6 h-6 object-contain filter invert" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-lg leading-tight tracking-tight">Matka Pro</span>
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Admin Panel</span>
            </div>
          </div>
        </div>
        <SidebarGroup className="mt-4">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5 px-3">
              {navigation.map((item) => {
                const isActive = location === item.href || location.startsWith(item.href + '/');
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.name} className="h-10 rounded-lg transition-all duration-200 hover-elevate">
                      <Link href={item.href} className={isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}>
                        <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <div className="mt-auto p-4">
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const title = navigation.find(n => location.startsWith(n.href))?.name || "Dashboard";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-screen bg-background/50">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 w-full">
          <header className="sticky top-0 z-30 flex h-12 sm:h-14 lg:h-16 shrink-0 items-center gap-1.5 sm:gap-3 border-b border-border/40 bg-background/95 px-2 sm:px-4 md:px-6 lg:px-8 backdrop-blur-xl">
            <SidebarTrigger className="-ml-1 md:hidden flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9" />
            <h1 className="text-sm sm:text-base lg:text-xl font-display font-semibold tracking-tight text-foreground truncate">{title}</h1>
          </header>
          <main className="flex-1 overflow-x-hidden overflow-y-auto w-full px-2 sm:px-3 md:px-4 lg:px-6 py-3 sm:py-4 md:py-6 max-w-[1600px] mx-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
