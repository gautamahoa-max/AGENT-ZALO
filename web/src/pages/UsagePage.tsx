import React, { useEffect, useState } from "react";


type UsageData = {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cachedTokens: number;
  estCost: string;
};

export const UsagePage: React.FC = () => {
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((e) => console.error(e));
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="px-6 py-4 border-b bg-white"><h1 className="text-2xl font-bold text-gray-800">Thống Kê Chi Phí & Sử Dụng</h1></div>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {!data ? (
            <div className="text-gray-500">Đang tải dữ liệu...</div>
          ) : (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2">Usage & Analytics</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-gray-100 p-4 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-500 font-semibold mb-1">TOTAL REQUESTS</div>
                  <div className="text-3xl font-bold text-gray-800">
                    {data.totalRequests.toLocaleString()}
                  </div>
                </div>
                
                <div className="bg-gray-100 p-4 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-500 font-semibold mb-1">TOTAL INPUT TOKENS</div>
                  <div className="text-3xl font-bold text-orange-600">
                    {data.totalInputTokens.toLocaleString()}
                  </div>
                </div>

                <div className="bg-gray-100 p-4 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-500 font-semibold mb-1">CACHED TOKENS</div>
                  <div className="text-3xl font-bold text-blue-600">
                    {data.cachedTokens.toLocaleString()}
                  </div>
                </div>

                <div className="bg-gray-100 p-4 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-500 font-semibold mb-1">OUTPUT TOKENS</div>
                  <div className="text-3xl font-bold text-green-600">
                    {data.totalOutputTokens.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 p-6 rounded-lg text-white mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
                </div>
                <div className="text-sm font-semibold mb-1 text-gray-400">EST. COST</div>
                <div className="text-4xl font-bold text-yellow-400 mb-1">
                  ~${data.estCost}
                </div>
                <div className="text-xs text-gray-500">Estimated, not actual billing</div>
              </div>

              <div className="mt-8 border-t pt-6">
                <h3 className="text-lg font-bold mb-4">Google Native Architecture</h3>
                <div className="p-4 bg-gray-50 rounded border text-sm text-gray-600 flex items-center justify-center h-32">
                   {/* Placeholder for the diagram */}
                   <div className="text-center">
                     <div className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded font-semibold border border-blue-200">
                       Google Gemini Native Engine
                     </div>
                     <div className="mt-2">Đang kết nối: Google API (gemini-3.6-flash)</div>
                   </div>
                </div>
              </div>
              
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
