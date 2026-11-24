import MobileShell from '@/components/mobile/MobileShell';

export default function MobilePage() {
  return (
    <main className="min-h-screen bg-[#040711] flex items-center justify-center p-0 sm:p-4 md:p-6">
      <div className="w-full h-screen sm:h-[844px] max-w-[430px] flex flex-col">
        <MobileShell />
      </div>
    </main>
  );
}
