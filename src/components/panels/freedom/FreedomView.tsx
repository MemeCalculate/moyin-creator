"use client";

import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFreedomStore } from '@/stores/freedom-store';
import { ImageStudio } from './ImageStudio';
import { VideoStudio } from './VideoStudio';
import { CinemaStudio } from './CinemaStudio';

export function FreedomView() {
  const { t } = useTranslation();
  const { activeStudio, setActiveStudio } = useFreedomStore();

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <Tabs
        value={activeStudio}
        onValueChange={(v) => setActiveStudio(v as any)}
        className="flex flex-col h-full"
      >
        <div className="h-12 border-b flex items-center px-4 shrink-0">
          <TabsList className="h-9">
            <TabsTrigger value="image" className="text-sm px-4">
              🖼️ {t("图片工作室")}
            </TabsTrigger>
            <TabsTrigger value="video" className="text-sm px-4">
              🎥 {t("视频工作室")}
            </TabsTrigger>
            <TabsTrigger value="cinema" className="text-sm px-4">
              🎬 {t("电影工作室")}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="image" className="flex-1 m-0 overflow-hidden">
          <ImageStudio />
        </TabsContent>
        <TabsContent value="video" className="flex-1 m-0 overflow-hidden">
          <VideoStudio />
        </TabsContent>
        <TabsContent value="cinema" className="flex-1 m-0 overflow-hidden">
          <CinemaStudio />
        </TabsContent>
      </Tabs>
    </div>
  );
}
