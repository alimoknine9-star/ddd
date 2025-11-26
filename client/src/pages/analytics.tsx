import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Flame, AlertCircle, DollarSign, Clock } from "lucide-react";
import type { OrderWithItems } from "@shared/schema";

export default function AnalyticsPage() {
  const { data: salesData = [] } = useQuery({
    queryKey: ["/api/analytics/sales"],
  });

  const { data: popularItems = [] } = useQuery({
    queryKey: ["/api/analytics/popular-items"],
  });

  const { data: cancellationData } = useQuery({
    queryKey: ["/api/analytics/cancellation-rate"],
  });

  const { data: confirmedOrders = [] } = useQuery<OrderWithItems[]>({
    queryKey: ["/api/orders", "confirmed"],
  });

  const totalSales = salesData.reduce((sum, day) => sum + parseFloat(day.totalSales || 0), 0);
  const avgDailySales = totalSales / (salesData.length || 1);

  const getPeakHours = () => {
    const hourCounts: Record<number, number> = {};
    confirmedOrders.forEach(order => {
      const hour = new Date(order.createdAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const peakHourData = Object.entries(hourCounts)
      .map(([hour, count]) => ({
        hour: `${hour}:00`,
        orders: count,
      }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

    const maxOrders = Math.max(...Object.values(hourCounts));
    const peakHour = Object.entries(hourCounts).find(([_, count]) => count === maxOrders);
    
    return { peakHourData, peakHour: peakHour ? `${peakHour[0]}:00` : "N/A", maxOrders };
  };

  const { peakHourData, peakHour, maxOrders } = getPeakHours();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        <p className="text-muted-foreground">Restaurant performance metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4" />
              Total Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${totalSales.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{salesData.length} days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4" />
              Avg Daily Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${avgDailySales.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Flame className="h-4 w-4" />
              Top Item
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{popularItems[0]?.name || "N/A"}</p>
            <p className="text-xs text-muted-foreground">{popularItems[0]?.quantity || 0} sold</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" />
              Peak Hour
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{peakHour}</p>
            <p className="text-xs text-muted-foreground">{maxOrders} orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4" />
              Cancellation Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{cancellationData?.cancellationRate || 0}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Daily Sales Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {salesData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="totalSales" stroke="#3b82f6" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground">No data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Popular Menu Items</CardTitle>
          </CardHeader>
          <CardContent>
            {popularItems.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={popularItems}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="quantity" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground">No data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Peak Hours</CardTitle>
          </CardHeader>
          <CardContent>
            {peakHourData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={peakHourData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground">No data available</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
