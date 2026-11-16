FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/Imoveis.Web/Imoveis.Web.csproj Imoveis.Web/
RUN dotnet restore Imoveis.Web/Imoveis.Web.csproj
COPY src/Imoveis.Web/ Imoveis.Web/
RUN dotnet publish Imoveis.Web/Imoveis.Web.csproj --no-restore -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
RUN mkdir -p /media/imoveis /keys && chown -R app:app /media/imoveis /keys
USER app
ENTRYPOINT ["dotnet","Imoveis.Web.dll"]
