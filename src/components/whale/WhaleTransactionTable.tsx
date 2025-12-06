import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  ExternalLink, 
  Search, 
  ArrowDownRight, 
  ArrowUpRight, 
  Activity,
  ChevronDown,
  ChevronUp,
  List,
  Building2,
  Landmark,
  Coins,
  Wallet
} from "lucide-react";

interface WhaleTransaction {
  hash: string;
  blockchain: string;
  amount: number;
  amountUsd: number;
  from: string;
  to: string;
  fromLabel?: string;
  toLabel?: string;
  timestamp: string;
  type: 'transfer' | 'exchange_inflow' | 'exchange_outflow' | 'unknown';
  significance: 'high' | 'medium' | 'low';
}

interface WhaleTransactionTableProps {
  transactions: WhaleTransaction[];
  isLoading: boolean;
}

const formatAmount = (amount: number, blockchain: string) => {
  if (blockchain === 'bitcoin') {
    return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} BTC`;
  }
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ETH`;
};

const formatUsd = (amount: number) => {
  if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(2)}B`;
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
};

const truncateAddress = (address: string) => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const getBlockchainExplorer = (hash: string, blockchain: string) => {
  if (blockchain === 'bitcoin') {
    return `https://blockchair.com/bitcoin/transaction/${hash}`;
  }
  return `https://etherscan.io/tx/${hash}`;
};

// Get icon and color for labeled wallets
const getLabelStyle = (label: string) => {
  const lowerLabel = label.toLowerCase();
  
  // Exchanges
  if (['binance', 'coinbase', 'kraken', 'okx', 'gemini', 'bitfinex', 'bitstamp', 'ftx'].some(e => lowerLabel.includes(e))) {
    return { icon: Building2, color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' };
  }
  
  // Institutions
  if (['microstrategy', 'tesla', 'block.one', 'jump', 'galaxy', 'alameda', 'wintermute'].some(i => lowerLabel.includes(i))) {
    return { icon: Landmark, color: 'text-purple-400 bg-purple-400/10 border-purple-400/30' };
  }
  
  // Funds
  if (['grayscale', 'fidelity', 'gbtc'].some(f => lowerLabel.includes(f))) {
    return { icon: Coins, color: 'text-amber-400 bg-amber-400/10 border-amber-400/30' };
  }
  
  // DeFi
  if (['uniswap', '1inch', 'lido', 'opensea', 'weth', 'seaport', '0x', 'wormhole'].some(d => lowerLabel.includes(d))) {
    return { icon: Activity, color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' };
  }
  
  // Foundation
  if (lowerLabel.includes('foundation')) {
    return { icon: Wallet, color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30' };
  }
  
  return { icon: Wallet, color: 'text-muted-foreground bg-muted/20 border-border/50' };
};

const AddressCell = ({ address, label }: { address: string; label?: string }) => {
  if (label) {
    const { icon: Icon, color } = getLabelStyle(label);
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${color} cursor-pointer`}>
              <Icon className="h-3 w-3" />
              <span className="text-xs font-medium">{label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="font-mono text-xs">{address}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <span className="font-mono text-xs text-muted-foreground">
      {truncateAddress(address)}
    </span>
  );
};

export const WhaleTransactionTable = ({ transactions, isLoading }: WhaleTransactionTableProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<'amountUsd' | 'timestamp'>('amountUsd');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterType, setFilterType] = useState<string>('all');

  const handleSort = (field: 'amountUsd' | 'timestamp') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredTransactions = transactions
    .filter(tx => {
      const matchesSearch = 
        tx.hash.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.to.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.fromLabel?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.toLabel?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || tx.type === filterType;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      const multiplier = sortDirection === 'asc' ? 1 : -1;
      if (sortField === 'amountUsd') {
        return (a.amountUsd - b.amountUsd) * multiplier;
      }
      return (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) * multiplier;
    });

  // Count labeled wallets
  const labeledCount = transactions.filter(tx => tx.fromLabel || tx.toLabel).length;

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const getTypeIcon = (type: WhaleTransaction['type']) => {
    switch (type) {
      case 'exchange_inflow':
        return <ArrowDownRight className="h-4 w-4 text-destructive" />;
      case 'exchange_outflow':
        return <ArrowUpRight className="h-4 w-4 text-success" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const SortIcon = ({ field }: { field: 'amountUsd' | 'timestamp' }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="h-3 w-3" /> : 
      <ChevronDown className="h-3 w-3" />;
  };

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <List className="h-5 w-5 text-primary" />
            Transaction History
          </div>
          <div className="flex items-center gap-2">
            {labeledCount > 0 && (
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                {labeledCount} identified
              </Badge>
            )}
            <Badge variant="secondary">{filteredTransactions.length} transactions</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Legend */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">Wallet Types:</span>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-400/10 text-blue-400 border border-blue-400/30">
            <Building2 className="h-3 w-3" /> Exchange
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-400/10 text-purple-400 border border-purple-400/30">
            <Landmark className="h-3 w-3" /> Institution
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-400/10 text-amber-400 border border-amber-400/30">
            <Coins className="h-3 w-3" /> Fund
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/30">
            <Activity className="h-3 w-3" /> DeFi
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by hash, address, or wallet name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-background/50"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'exchange_inflow', 'exchange_outflow', 'transfer'].map((type) => (
              <Button
                key={type}
                variant={filterType === type ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType(type)}
                className="text-xs"
              >
                {type === 'all' ? 'All' : 
                  type === 'exchange_inflow' ? 'Inflow' : 
                  type === 'exchange_outflow' ? 'Outflow' : 'Transfer'}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-background/50 hover:bg-background/50">
                  <TableHead className="w-[80px]">Chain</TableHead>
                  <TableHead className="w-[80px]">Type</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort('amountUsd')}
                  >
                    <div className="flex items-center gap-1">
                      Amount <SortIcon field="amountUsd" />
                    </div>
                  </TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="w-[80px]">Impact</TableHead>
                  <TableHead className="w-[50px]">Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((tx, index) => (
                    <TableRow 
                      key={`${tx.hash}-${index}`}
                      className="hover:bg-background/30 transition-colors"
                    >
                      <TableCell>
                        <Badge variant="outline" className="uppercase text-xs">
                          {tx.blockchain === 'bitcoin' ? 'BTC' : 'ETH'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {getTypeIcon(tx.type)}
                          <span className="text-xs text-muted-foreground">
                            {tx.type === 'exchange_inflow' ? 'In' : 
                              tx.type === 'exchange_outflow' ? 'Out' : 'Tx'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium text-foreground">
                            {formatUsd(tx.amountUsd)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatAmount(tx.amount, tx.blockchain)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <AddressCell address={tx.from} label={tx.fromLabel} />
                      </TableCell>
                      <TableCell>
                        <AddressCell address={tx.to} label={tx.toLabel} />
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            tx.significance === 'high' ? 'destructive' : 
                            tx.significance === 'medium' ? 'secondary' : 'outline'
                          }
                          className={tx.significance === 'medium' ? 'bg-warning/20 text-warning' : ''}
                        >
                          {tx.significance}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <a
                          href={getBlockchainExplorer(tx.hash, tx.blockchain)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};