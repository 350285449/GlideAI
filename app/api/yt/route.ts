import { NextResponse } from 'next/server';
import play from 'play-dl';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }

  try {
    const info = await play.video_info(url);
    
    // Find the best video format that has a direct URL (usually 360p mp4, which is perfect for MediaPipe's 256x256 internal resolution)
    const formats = info.format.filter(f => f.url && f.mimeType && f.mimeType.includes('video/'));
    
    if (formats.length === 0) {
      return NextResponse.json({ error: 'No suitable direct video format found for playback.' }, { status: 404 });
    }

    // Sort by quality if multiple exist, though usually it's just itag 18
    const bestFormat = formats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];

    return NextResponse.json({ url: bestFormat.url, videoId: info.video_details.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

