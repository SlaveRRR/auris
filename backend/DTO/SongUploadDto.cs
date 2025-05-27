// DTOs/SongUploadDto.cs
public class SongUploadDto
{
    public string Title { get; set; }
    public string Artist { get; set; }
    public int Duration { get; set; }
    public IFormFile File { get; set; }
}
